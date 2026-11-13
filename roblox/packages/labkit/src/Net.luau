--!strict
-- LabKit.Net
-- Declarative remote contracts. Every remote is declared once in shared code with its
-- direction, argument schemas, and rate limit. The server side only calls a handler
-- after the sender is rate-limited and every argument passes its schema; extra
-- arguments are rejected. Clients receive no information about why a request failed
-- beyond a stable reason code.
--
--   local Remotes = Net.define({
--       RequestPurchase = { kind = "function", args = { Schema.string({ maxLength = 40 }) },
--                           rate = { capacity = 5, refillPerSecond = 1 } },
--       Toast = { kind = "toClient" },
--   })
--   local server = Net.Server.new(Remotes)           -- server
--   server:handle("RequestPurchase", function(player, itemId) ... return true, result end)
--   local client = Net.Client.new(Remotes)           -- client
--   local ok, result = client:invoke("RequestPurchase", "sword")

local function import(name)
	if script ~= nil then
		return require(script.Parent[name])
	end
	return require("./" .. name)
end

local RateLimiter = import("RateLimiter")

local Net = {}

local KINDS = { event = true, ["function"] = true, toClient = true, unreliable = true }
local DEFAULT_RATE = { capacity = 20, refillPerSecond = 10 }
local FOLDER_NAME = "LabKitNet"

function Net.define(spec)
	assert(type(spec) == "table", "Net.define expects a table")
	local contracts = {}
	for name, entry in pairs(spec) do
		assert(type(name) == "string" and string.match(name, "^[%a][%w_]*$"), "Remote names must be identifiers")
		assert(type(entry) == "table", "Remote " .. name .. " must be a table")
		local kind = entry.kind or "event"
		assert(KINDS[kind], "Remote " .. name .. " has unknown kind " .. tostring(kind))
		local args = entry.args or {}
		for index, schema in ipairs(args) do
			assert(type(schema) == "function", "Remote " .. name .. " argument " .. index .. " needs a schema")
		end
		contracts[name] = table.freeze({
			name = name,
			kind = kind,
			args = table.freeze(table.clone(args)),
			rate = entry.rate or DEFAULT_RATE,
			cost = entry.cost or 1,
		})
	end
	return table.freeze(contracts)
end

-- Validates a packed argument list `{ n = count, ... }` against a contract.
function Net.validateArgs(contract, packed)
	local count = packed.n or #packed
	if count > #contract.args then
		return false, "too_many_arguments"
	end
	for index, schema in ipairs(contract.args) do
		local ok, err = schema(packed[index], "arg" .. tostring(index))
		if not ok then
			return false, "invalid_argument", err
		end
	end
	return true
end

-- Transport --------------------------------------------------------------------
-- The Roblox transport maps contracts onto RemoteEvent, RemoteFunction, and
-- UnreliableRemoteEvent instances in one folder. Tests inject a fake transport.

local function robloxTransport(parent, isServer, timeout)
	local folder
	if isServer then
		folder = parent:FindFirstChild(FOLDER_NAME)
		if folder == nil then
			folder = Instance.new("Folder")
			folder.Name = FOLDER_NAME
			folder.Parent = parent
		end
	else
		folder = parent:WaitForChild(FOLDER_NAME, timeout)
		assert(folder ~= nil, "LabKit.Net folder was not replicated in time")
	end
	local classFor = {
		event = "RemoteEvent",
		toClient = "RemoteEvent",
		["function"] = "RemoteFunction",
		unreliable = "UnreliableRemoteEvent",
	}
	return {
		get = function(contract)
			local className = classFor[contract.kind]
			if isServer then
				local existing = folder:FindFirstChild(contract.name)
				if existing then
					assert(existing.ClassName == className, contract.name .. " must be a " .. className)
					return existing
				end
				local remote = Instance.new(className)
				remote.Name = contract.name
				remote.Parent = folder
				return remote
			end
			local remote = folder:WaitForChild(contract.name, timeout)
			assert(remote ~= nil, "Remote " .. contract.name .. " was not replicated in time")
			return remote
		end,
	}
end

-- Server -----------------------------------------------------------------------

local Server = {}
Server.__index = Server
Net.Server = Server

function Server.new(contracts, options)
	local opts = options or {}
	local transport = opts.transport
	if transport == nil then
		transport = robloxTransport(opts.parent or game:GetService("ReplicatedStorage"), true)
	end
	local self = setmetatable({
		contracts = contracts,
		_transport = transport,
		_remotes = {},
		_limiters = {},
		_handlers = {},
		_clock = opts.clock,
		_onReject = opts.onReject,
		stats = { accepted = 0, rejected = 0 },
	}, Server)
	for name, contract in pairs(contracts) do
		self._remotes[name] = transport.get(contract)
		self._limiters[name] = RateLimiter.new({
			capacity = contract.rate.capacity,
			refillPerSecond = contract.rate.refillPerSecond,
			clock = opts.clock,
		})
	end
	return self
end

function Server:_reject(player, name, reason, detail)
	self.stats.rejected += 1
	if self._onReject then
		self._onReject(player, name, reason, detail)
	end
	return false, reason
end

-- Runs the full validation pipeline and the handler. Exposed for tests and for
-- transports that do not use Roblox remotes.
function Server:dispatch(name, player, ...)
	local contract = self.contracts[name]
	if contract == nil then
		return self:_reject(player, name, "unknown_remote")
	end
	if contract.kind == "toClient" then
		return self:_reject(player, name, "wrong_direction")
	end
	local handler = self._handlers[name]
	if handler == nil then
		return self:_reject(player, name, "no_handler")
	end
	if not self._limiters[name]:consume(player, contract.cost) then
		return self:_reject(player, name, "rate_limited")
	end
	local packed = table.pack(...)
	local ok, reason, detail = Net.validateArgs(contract, packed)
	if not ok then
		return self:_reject(player, name, reason, detail)
	end
	self.stats.accepted += 1
	local callOk, result, value = pcall(handler, player, table.unpack(packed, 1, packed.n))
	if not callOk then
		local warnFn = rawget(_G, "warn") or warn or print
		warnFn("[LabKit.Net] handler " .. name .. " failed: " .. tostring(result))
		return false, "server_error"
	end
	if contract.kind == "function" then
		if result == true then
			return true, value
		end
		return false, value or "rejected"
	end
	return true
end

function Server:handle(name, handler)
	local contract = self.contracts[name]
	assert(contract ~= nil, "Unknown remote " .. tostring(name))
	assert(contract.kind ~= "toClient", name .. " is server-to-client only")
	assert(self._handlers[name] == nil, "Remote " .. name .. " already has a handler")
	self._handlers[name] = handler
	local remote = self._remotes[name]
	if typeof(remote) == "Instance" then
		if contract.kind == "function" then
			remote.OnServerInvoke = function(player, ...)
				return self:dispatch(name, player, ...)
			end
		else
			return remote.OnServerEvent:Connect(function(player, ...)
				self:dispatch(name, player, ...)
			end)
		end
	end
	return nil
end

function Server:fire(name, player, ...)
	local contract = self.contracts[name]
	assert(contract ~= nil and contract.kind ~= "function", "fire expects an event remote")
	self._remotes[name]:FireClient(player, ...)
end

function Server:fireAll(name, ...)
	local contract = self.contracts[name]
	assert(contract ~= nil and contract.kind ~= "function", "fireAll expects an event remote")
	self._remotes[name]:FireAllClients(...)
end

function Server:fireExcept(name, excluded, players, ...)
	for _, player in ipairs(players) do
		if player ~= excluded then
			self:fire(name, player, ...)
		end
	end
end

function Server:removePlayer(player)
	for _, limiter in pairs(self._limiters) do
		limiter:remove(player)
	end
end

-- Client -----------------------------------------------------------------------

local Client = {}
Client.__index = Client
Net.Client = Client

function Client.new(contracts, options)
	local opts = options or {}
	local transport = opts.transport
	if transport == nil then
		transport = robloxTransport(opts.parent or game:GetService("ReplicatedStorage"), false, opts.timeout or 30)
	end
	local self = setmetatable({ contracts = contracts, _remotes = {} }, Client)
	for name, contract in pairs(contracts) do
		self._remotes[name] = transport.get(contract)
	end
	return self
end

function Client:fire(name, ...)
	local contract = self.contracts[name]
	assert(contract ~= nil and (contract.kind == "event" or contract.kind == "unreliable"), name .. " is not a client event")
	self._remotes[name]:FireServer(...)
end

function Client:invoke(name, ...)
	local contract = self.contracts[name]
	assert(contract ~= nil and contract.kind == "function", name .. " is not a remote function")
	local remote = self._remotes[name]
	local args = table.pack(...)
	local ok, success, value = pcall(function()
		return remote:InvokeServer(table.unpack(args, 1, args.n))
	end)
	if not ok then
		return false, "transport_error"
	end
	return success == true, value
end

function Client:on(name, handler)
	local contract = self.contracts[name]
	assert(contract ~= nil and (contract.kind == "toClient" or contract.kind == "unreliable" or contract.kind == "event"), name .. " cannot be received by clients")
	return self._remotes[name].OnClientEvent:Connect(handler)
end

return Net
