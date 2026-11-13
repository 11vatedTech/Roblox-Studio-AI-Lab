-- Roblox-free specs for LabKit.Net using an injected fake transport.
local Net = require("../src/Net")
local Schema = require("../src/Schema")

local function fakeTransport()
	local created = {}
	return {
		created = created,
		get = function(contract)
			local remote = { name = contract.name, fired = {} }
			function remote:FireClient(player, ...)
				table.insert(self.fired, { player = player, args = table.pack(...) })
			end
			function remote:FireAllClients(...)
				table.insert(self.fired, { player = "all", args = table.pack(...) })
			end
			created[contract.name] = remote
			return remote
		end,
	}
end

local Remotes = Net.define({
	BuyItem = {
		kind = "function",
		args = { Schema.string({ maxLength = 16 }), Schema.integer({ min = 1, max = 10 }) },
		rate = { capacity = 2, refillPerSecond = 1 },
	},
	Emote = { kind = "event", args = { Schema.enum({ "wave", "dance" }) } },
	Toast = { kind = "toClient" },
})

local threw = not pcall(Net.define, { ["bad name"] = {} })
assert(threw, "remote names must be identifiers")
threw = not pcall(Net.define, { X = { kind = "teleport" } })
assert(threw, "unknown kinds are rejected")

local now = 0
local rejects = {}
local transport = fakeTransport()
local server = Net.Server.new(Remotes, {
	transport = transport,
	clock = function()
		return now
	end,
	onReject = function(player, name, reason)
		table.insert(rejects, player .. ":" .. name .. ":" .. reason)
	end,
})

local purchases = {}
server:handle("BuyItem", function(player, itemId, quantity)
	if itemId == "locked" then
		return false, "not_owned"
	end
	table.insert(purchases, player .. ":" .. itemId .. "x" .. quantity)
	return true, { itemId = itemId, quantity = quantity }
end)
server:handle("Emote", function(player, name)
	if name == "dance" then
		error("animation missing")
	end
end)

local ok, result = server:dispatch("BuyItem", "p1", "sword", 2)
assert(ok == true and result.quantity == 2, "valid request reaches handler and returns value")
ok, result = server:dispatch("BuyItem", "p1", "locked", 1)
assert(ok == false and result == "not_owned", "handler refusal is returned as a reason")
ok, result = server:dispatch("BuyItem", "p1", "sword", 1)
assert(ok == false and result == "rate_limited", "third burst request is rate limited")
now = 5
ok, result = server:dispatch("BuyItem", "p1", "sword", 0 / 0)
assert(ok == false and result == "invalid_argument", "NaN quantity is rejected before the handler")
ok, result = server:dispatch("BuyItem", "p1", "sword", 1, "extra")
assert(ok == false and result == "too_many_arguments", "extra arguments are rejected")
ok, result = server:dispatch("BuyItem", "p2", { "table" }, 1)
assert(ok == false and result == "invalid_argument", "wrong types are rejected")
ok, result = server:dispatch("Toast", "p1")
assert(ok == false and result == "wrong_direction", "clients cannot send server-to-client remotes")
ok, result = server:dispatch("Nope", "p1")
assert(ok == false and result == "unknown_remote", "unknown remotes rejected")
ok, result = server:dispatch("Emote", "p1", "dance")
assert(ok == false and result == "server_error", "handler errors are contained")
ok = server:dispatch("Emote", "p1", "wave")
assert(ok == true, "valid event accepted")
assert(#purchases == 1, "exactly one purchase reached game logic")
assert(server.stats.rejected == #rejects and #rejects == 6, "every rejection is reported: " .. #rejects)

server:fire("Toast", "p1", "Welcome")
server:fireAll("Toast", "Round starting")
assert(#transport.created.Toast.fired == 2, "server-to-client fires go through the transport")
threw = not pcall(function()
	server:handle("Toast", function() end)
end)
assert(threw, "cannot attach a handler to a server-to-client remote")
threw = not pcall(function()
	server:handle("BuyItem", function() end)
end)
assert(threw, "a remote cannot have two handlers")
server:removePlayer("p1")

print("PASS LabKit Net: contracts, validation, rate limits, direction, error containment")
