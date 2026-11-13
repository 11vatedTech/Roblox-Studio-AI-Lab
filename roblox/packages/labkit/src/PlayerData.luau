--!strict
-- LabKit.PlayerData
-- Session-locked, versioned, migrating player persistence on top of any key/value
-- store with an atomic update operation (Roblox DataStore UpdateAsync).
--
-- Guarantees:
--   * One server owns a profile at a time. A second server cannot load the profile
--     while a fresh lock exists; a lock older than `lockTimeout` is stolen.
--   * Every save re-checks ownership. If another server stole the session, this
--     server stops writing and fires `Released` with reason "session_lost" so the
--     game can kick the player instead of duplicating items.
--   * Data is versioned. Migrations run in order; data written by a newer schema is
--     refused so an old server cannot silently delete new fields.
--   * Missing template fields are deep-filled on load (additive schema changes are safe).
--   * Receipts for developer-product purchases are stored inside the same record, so a
--     grant and its idempotency marker are always saved atomically.
--
-- Store adapters implement `update(key, transform) -> (ok, valueOrError)` where
-- `transform(current)` returns the new value or nil to abort without writing.

local function import(name)
	if script ~= nil then
		return require(script.Parent[name])
	end
	return require("./" .. name)
end

local Signal = import("Signal")
local Retry = import("Retry")

local PlayerData = {}
PlayerData.__index = PlayerData

local Profile = {}
Profile.__index = Profile
PlayerData.Profile = Profile

local MAX_RECEIPTS = 100

local function deepCopy(value)
	if type(value) ~= "table" then
		return value
	end
	local result = {}
	for key, item in pairs(value) do
		result[deepCopy(key)] = deepCopy(item)
	end
	return result
end

PlayerData.deepCopy = deepCopy

-- Adds template keys missing from `data` without overwriting existing values.
local function reconcile(data, template)
	for key, item in pairs(template) do
		if data[key] == nil then
			data[key] = deepCopy(item)
		elseif type(item) == "table" and type(data[key]) == "table" and #item == 0 and next(item) ~= nil then
			reconcile(data[key], item)
		end
	end
	return data
end

PlayerData.reconcile = reconcile

-- Adapters -----------------------------------------------------------------------

-- In-memory adapter for CLI specs, Studio sessions without API access, and local tests.
-- `failNext(n)` makes the next n updates fail, to exercise retry paths.
function PlayerData.memoryAdapter()
	local records = {}
	local failures = 0
	local adapter = { writes = 0 }
	function adapter.update(key, transform)
		if failures > 0 then
			failures -= 1
			return false, "simulated_failure"
		end
		local current = deepCopy(records[key])
		local nextValue = transform(current)
		if nextValue ~= nil then
			records[key] = deepCopy(nextValue)
			adapter.writes += 1
		end
		return true, deepCopy(nextValue)
	end
	function adapter.peek(key)
		return deepCopy(records[key])
	end
	function adapter.failNext(count)
		failures = count
	end
	return adapter
end

-- Roblox DataStore adapter. UpdateAsync gives the atomic read-modify-write the
-- session lock depends on; SetAsync/GetAsync would race between servers.
function PlayerData.dataStoreAdapter(dataStore)
	assert(dataStore ~= nil, "dataStoreAdapter expects a DataStore")
	return {
		update = function(key, transform)
			local result
			local ok, err = pcall(function()
				result = dataStore:UpdateAsync(key, function(current)
					return transform(current)
				end)
			end)
			if not ok then
				return false, tostring(err)
			end
			return true, result
		end,
	}
end

-- Store ------------------------------------------------------------------------

function PlayerData.new(options)
	assert(type(options) == "table", "PlayerData.new expects options")
	assert(options.adapter ~= nil, "PlayerData.new requires an adapter")
	assert(type(options.template) == "table", "PlayerData.new requires a template table")
	local version = options.version or 1
	assert(type(version) == "number" and version >= 1 and version % 1 == 0, "version must be a positive integer")
	local migrations = options.migrations or {}
	for from = 1, version - 1 do
		assert(type(migrations[from]) == "function", "missing migration from version " .. from)
	end
	return setmetatable({
		adapter = options.adapter,
		template = deepCopy(options.template),
		version = version,
		migrations = migrations,
		jobId = options.jobId or "studio-local",
		clock = options.clock or os.time,
		lockTimeout = options.lockTimeout or 30 * 60,
		retry = options.retry or { attempts = 5, baseDelay = 1, maxDelay = 8 },
		validate = options.validate,
		profiles = {},
	}, PlayerData)
end

function PlayerData:_migrate(record)
	local data = record.data
	local from = record.schemaVersion or 1
	if from > self.version then
		return nil, "data_from_newer_version"
	end
	while from < self.version do
		local migrated = self.migrations[from](data)
		assert(type(migrated) == "table", "migration from version " .. from .. " must return a table")
		data = migrated
		from += 1
	end
	record.data = reconcile(data, self.template)
	record.schemaVersion = self.version
	return record
end

-- Loads and locks a profile. Returns `profile` or `nil, reason` where reason is one of
-- "session_locked", "data_from_newer_version", "invalid_data", or a store error.
function PlayerData:load(key)
	assert(type(key) == "string" and key ~= "", "profile key must be a non-empty string")
	if self.profiles[key] ~= nil then
		return nil, "already_loaded"
	end
	local refusal = nil
	local ok, record, attempts = Retry.run(function()
		refusal = nil
		local updateOk, value = self.adapter.update(key, function(current)
			local now = self.clock()
			local stored = current
			if stored == nil then
				stored = {
					schemaVersion = self.version,
					data = deepCopy(self.template),
					meta = { createdAt = now, saveCount = 0, receipts = {} },
				}
			end
			stored.meta = stored.meta or { createdAt = now, saveCount = 0 }
			stored.meta.receipts = stored.meta.receipts or {}
			local session = stored.session
			if session ~= nil and session.jobId ~= self.jobId then
				local stale = now - (session.lockedAt or 0) >= self.lockTimeout
				if not stale then
					refusal = "session_locked"
					return nil
				end
				stored.meta.stolenFrom = session.jobId
			end
			if (stored.schemaVersion or 1) > self.version then
				refusal = "data_from_newer_version"
				return nil
			end
			local migrated = self:_migrate(stored)
			if self.validate then
				local valid, why = self.validate(migrated.data)
				if not valid then
					refusal = "invalid_data"
					stored.meta.lastInvalid = tostring(why)
					return nil
				end
			end
			migrated.session = { jobId = self.jobId, lockedAt = now }
			migrated.meta.updatedAt = now
			return migrated
		end)
		if not updateOk then
			return false, value
		end
		if refusal ~= nil then
			return false, refusal
		end
		return true, value
	end, {
		attempts = self.retry.attempts,
		baseDelay = self.retry.baseDelay,
		maxDelay = self.retry.maxDelay,
		sleep = self.retry.sleep,
		shouldRetry = function(reason)
			return reason ~= "data_from_newer_version" and reason ~= "invalid_data"
		end,
	})
	if not ok then
		return nil, record
	end
	local profile = setmetatable({
		key = key,
		store = self,
		Data = record.data,
		Meta = record.meta,
		Released = Signal.new(),
		_active = true,
		_pendingReceipts = false,
		loadAttempts = attempts,
	}, Profile)
	self.profiles[key] = profile
	return profile
end

function PlayerData:get(key)
	return self.profiles[key]
end

function PlayerData:saveAll()
	local results = {}
	for key, profile in pairs(self.profiles) do
		results[key] = profile:save()
	end
	return results
end

function PlayerData:releaseAll()
	local keys = {}
	for key in pairs(self.profiles) do
		table.insert(keys, key)
	end
	for _, key in ipairs(keys) do
		self.profiles[key]:release()
	end
end

-- Profile ----------------------------------------------------------------------

function Profile:isActive()
	return self._active
end

function Profile:_end(reason)
	if not self._active then
		return
	end
	self._active = false
	self.store.profiles[self.key] = nil
	self.Released:Fire(reason)
	self.Released:Destroy()
end

function Profile:_write(releasing)
	if not self._active then
		return false, "inactive"
	end
	local store = self.store
	local lost = false
	local snapshot = deepCopy(self.Data)
	local meta = deepCopy(self.Meta)
	local ok, err = Retry.run(function()
		lost = false
		local updateOk, value = store.adapter.update(self.key, function(current)
			if current == nil or current.session == nil or current.session.jobId ~= store.jobId then
				lost = true
				return nil
			end
			local now = store.clock()
			current.data = snapshot
			current.schemaVersion = store.version
			current.meta = meta
			current.meta.updatedAt = now
			current.meta.saveCount = (current.meta.saveCount or 0) + 1
			if releasing then
				current.session = nil
			else
				current.session.lockedAt = now
			end
			return current
		end)
		if not updateOk then
			return false, value
		end
		if lost then
			return false, "session_lost"
		end
		return true, value
	end, {
		attempts = store.retry.attempts,
		baseDelay = store.retry.baseDelay,
		maxDelay = store.retry.maxDelay,
		sleep = store.retry.sleep,
		shouldRetry = function(reason)
			return reason ~= "session_lost"
		end,
	})
	if not ok then
		if err == "session_lost" then
			self:_end("session_lost")
		end
		return false, err
	end
	self.Meta.saveCount = (self.Meta.saveCount or 0) + 1
	self._pendingReceipts = false
	return true
end

function Profile:save()
	return self:_write(false)
end

function Profile:release()
	if not self._active then
		return false, "inactive"
	end
	local ok, err = self:_write(true)
	if ok then
		self:_end("released")
	end
	return ok, err
end

function Profile:hasReceipt(purchaseId)
	for _, id in ipairs(self.Meta.receipts) do
		if id == purchaseId then
			return true
		end
	end
	return false
end

function Profile:addReceipt(purchaseId)
	assert(type(purchaseId) == "string" and purchaseId ~= "", "purchaseId must be a string")
	if self:hasReceipt(purchaseId) then
		return false
	end
	table.insert(self.Meta.receipts, purchaseId)
	while #self.Meta.receipts > MAX_RECEIPTS do
		table.remove(self.Meta.receipts, 1)
	end
	self._pendingReceipts = true
	return true
end

function Profile:hasUnsavedReceipts()
	return self._pendingReceipts
end

return PlayerData
