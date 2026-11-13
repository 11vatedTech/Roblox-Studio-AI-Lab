--!strict
-- LabKit.Economy
-- Server-authoritative currencies over a profile's data table. All amounts are
-- positive integers; balances never go negative or above the configured cap.
-- Operations carrying an idempotency key apply at most once (the key is remembered in
-- a bounded ring stored with the data), which makes retries, double-clicks, and
-- replayed remotes harmless. Every applied change emits one transaction event for
-- analytics and audit.
--
-- Data layout written into the profile data table:
--   data.wallet  = { [currency] = integer }
--   data.ledger  = { keys = { idempotencyKey... } }

local Economy = {}
Economy.__index = Economy

local MAX_LEDGER_KEYS = 200
local MAX_SAFE = 2 ^ 53

function Economy.new(options)
	assert(type(options) == "table" and type(options.currencies) == "table", "Economy.new expects currencies")
	local currencies = {}
	for name, config in pairs(options.currencies) do
		assert(type(name) == "string", "currency names must be strings")
		local cap = config.max or 1e12
		assert(type(cap) == "number" and cap > 0 and cap < MAX_SAFE, "currency cap must be a safe positive number")
		currencies[name] = { max = cap, starting = config.starting or 0 }
	end
	return setmetatable({
		currencies = currencies,
		onTransaction = options.onTransaction,
		clock = options.clock or os.time,
	}, Economy)
end

local function validAmount(amount)
	return type(amount) == "number" and amount == amount and amount > 0 and amount % 1 == 0 and amount < MAX_SAFE
end

function Economy:ensure(data)
	data.wallet = data.wallet or {}
	data.ledger = data.ledger or { keys = {} }
	data.ledger.keys = data.ledger.keys or {}
	for name, config in pairs(self.currencies) do
		if type(data.wallet[name]) ~= "number" then
			data.wallet[name] = config.starting
		end
	end
	return data
end

function Economy:balance(data, currency)
	assert(self.currencies[currency] ~= nil, "unknown currency " .. tostring(currency))
	self:ensure(data)
	return data.wallet[currency]
end

local function seen(data, key)
	if key == nil then
		return false
	end
	return table.find(data.ledger.keys, key) ~= nil
end

local function remember(data, key)
	if key == nil then
		return
	end
	table.insert(data.ledger.keys, key)
	while #data.ledger.keys > MAX_LEDGER_KEYS do
		table.remove(data.ledger.keys, 1)
	end
end

function Economy:_emit(kind, changes, options)
	if self.onTransaction then
		self.onTransaction({
			kind = kind,
			changes = changes,
			reason = options and options.reason or "unspecified",
			key = options and options.idempotencyKey,
			at = self.clock(),
		})
	end
end

-- Applies a multi-currency delta atomically: either every change applies or none do.
-- `deltas` maps currency -> signed integer. Returns ok, reason.
function Economy:apply(data, deltas, options)
	self:ensure(data)
	local key = options and options.idempotencyKey
	if key ~= nil and (type(key) ~= "string" or #key == 0 or #key > 120) then
		return false, "invalid_idempotency_key"
	end
	if seen(data, key) then
		return true, "duplicate"
	end
	local changes = {}
	for currency, delta in pairs(deltas) do
		local config = self.currencies[currency]
		if config == nil then
			return false, "unknown_currency"
		end
		if not validAmount(math.abs(delta)) then
			return false, "invalid_amount"
		end
		local nextBalance = data.wallet[currency] + delta
		if nextBalance < 0 then
			return false, "insufficient_funds"
		end
		if nextBalance > config.max then
			return false, "balance_cap"
		end
		changes[currency] = { before = data.wallet[currency], after = nextBalance, delta = delta }
	end
	for currency, change in pairs(changes) do
		data.wallet[currency] = change.after
	end
	remember(data, key)
	self:_emit("apply", changes, options)
	return true, "applied"
end

function Economy:grant(data, currency, amount, options)
	if not validAmount(amount) then
		return false, "invalid_amount"
	end
	return self:apply(data, { [currency] = amount }, options)
end

function Economy:spend(data, currency, amount, options)
	if not validAmount(amount) then
		return false, "invalid_amount"
	end
	return self:apply(data, { [currency] = -amount }, options)
end

-- Charges `cost` and then runs `grant(data)`. If the grant function fails or returns
-- false, the charge is refunded and the idempotency key is not consumed.
function Economy:purchase(data, cost, grant, options)
	self:ensure(data)
	local key = options and options.idempotencyKey
	if seen(data, key) then
		return true, "duplicate"
	end
	local deltas = {}
	for currency, amount in pairs(cost) do
		if not validAmount(amount) then
			return false, "invalid_amount"
		end
		deltas[currency] = -amount
	end
	local before = table.clone(data.wallet)
	local ok, reason = self:apply(data, deltas, { reason = options and options.reason })
	if not ok then
		return false, reason
	end
	local callOk, granted, grantReason = pcall(grant, data)
	if not callOk or granted == false then
		data.wallet = before
		self:_emit("refund", deltas, options)
		return false, (callOk and grantReason) or "grant_failed"
	end
	remember(data, key)
	return true, "applied"
end

return Economy
