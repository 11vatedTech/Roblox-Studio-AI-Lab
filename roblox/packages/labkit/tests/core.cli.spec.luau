-- Roblox-free specs for Signal, Trove, Schema, RateLimiter, and Retry.
local Signal = require("../src/Signal")
local Trove = require("../src/Trove")
local Schema = require("../src/Schema")
local RateLimiter = require("../src/RateLimiter")
local Retry = require("../src/Retry")

-- Signal: ordering, once, disconnect during fire, error isolation.
do
	local signal = Signal.new()
	local log = {}
	local first
	first = signal:Connect(function(value)
		table.insert(log, "a" .. value)
		first:Disconnect()
	end)
	signal:Once(function(value)
		table.insert(log, "once" .. value)
	end)
	local reported = 0
	local originalReport = Signal.reportError
	Signal.reportError = function()
		reported += 1
	end
	signal:Connect(function()
		error("boom")
	end)
	signal:Connect(function(value)
		table.insert(log, "c" .. value)
	end)
	signal:Fire(1)
	signal:Fire(2)
	Signal.reportError = originalReport
	assert(table.concat(log, ",") == "a1,once1,c1,c2", "signal order/once/disconnect: " .. table.concat(log, ","))
	assert(reported == 2, "a failing handler is isolated and reported each fire")
	assert(signal:GetConnectionCount() == 2, "two persistent connections remain")
	signal:Destroy()
	assert(signal:GetConnectionCount() == 0, "destroy disconnects all")
end

-- Trove: LIFO cleanup, nested troves, error isolation, remove.
do
	local order = {}
	local trove = Trove.new()
	trove:Add(function()
		table.insert(order, 1)
	end)
	local child = trove:Extend()
	child:Add({ Destroy = function()
		table.insert(order, 2)
	end })
	trove:Add({ Disconnect = function()
		table.insert(order, 3)
	end })
	local removed = trove:Add(function()
		table.insert(order, 99)
	end)
	assert(trove:Remove(removed) == true, "remove cleans the specific item")
	trove:Add(function()
		error("cleanup failure")
	end)
	local clean = trove:Clean()
	assert(clean == false, "clean reports failures")
	assert(table.concat(order, ",") == "99,3,2,1", "trove cleans in reverse order: " .. table.concat(order, ","))
	assert(trove:Count() == 0, "trove is empty after clean")
end

-- Schema: the values exploit clients actually send.
do
	local nan = 0 / 0
	local qty = Schema.integer({ min = 1, max = 99 })
	assert(qty(5) == true, "valid integer")
	assert(qty(nan) == false, "NaN rejected")
	assert(qty(math.huge) == false, "infinity rejected")
	assert(qty(1.5) == false, "fraction rejected")
	assert(qty(0) == false and qty(100) == false, "bounds enforced")
	assert(qty("5") == false, "string number rejected")
	local name = Schema.string({ maxLength = 8, pattern = "^[%w_]+$" })
	assert(name("sword_1") == true, "valid id")
	assert(name(string.rep("a", 9)) == false, "long string rejected")
	assert(name("a b") == false, "pattern enforced")
	assert(name("\255\254") == false, "invalid UTF-8 rejected")
	local order = Schema.struct({
		itemId = Schema.string({ maxLength = 32 }),
		quantity = qty,
		gift = Schema.optional(Schema.boolean()),
	})
	assert(order({ itemId = "sword", quantity = 2 }) == true, "valid struct")
	local ok, err = order({ itemId = "sword", quantity = 2, admin = true })
	assert(ok == false and string.find(err, "unexpected field admin", 1, true), "unknown keys rejected: " .. tostring(err))
	ok, err = order({ itemId = "sword", quantity = nan })
	assert(ok == false and string.find(err, "quantity", 1, true), "nested error names the field: " .. tostring(err))
	local list = Schema.array(Schema.integer(), { maxLength = 3 })
	assert(list({ 1, 2, 3 }) == true, "valid array")
	assert(list({ 1, 2, 3, 4 }) == false, "long array rejected")
	assert(list({ [1] = 1, [3] = 3 }) == false, "sparse array rejected")
	assert(list({ 1, x = 2 }) == false, "mixed table rejected")
	local mode = Schema.enum({ "solo", "duo" })
	assert(mode("duo") == true and mode("squad") == false, "enum")
	local id = Schema.union(Schema.integer({ min = 1 }), Schema.string({ maxLength = 4 }))
	assert(id(3) == true and id("ab") == true and id(false) == false, "union")
	local scores = Schema.map(Schema.string({ maxLength = 10 }), Schema.integer({ min = 0 }), { maxEntries = 2 })
	assert(scores({ a = 1, b = 2 }) == true and scores({ a = 1, b = 2, c = 3 }) == false, "map bounds")
	local threw = not pcall(Schema.assert, qty, -1, "qty")
	assert(threw, "Schema.assert raises")
end

-- RateLimiter: burst, refill, isolation per key.
do
	local now = 0
	local limiter = RateLimiter.new({ capacity = 3, refillPerSecond = 1, clock = function()
		return now
	end })
	assert(limiter:consume("p1") and limiter:consume("p1") and limiter:consume("p1"), "burst allowed up to capacity")
	assert(limiter:consume("p1") == false, "burst beyond capacity rejected")
	assert(limiter:consume("p2") == true, "keys are isolated")
	now = 1.5
	assert(limiter:consume("p1") == true, "refill restores a token")
	assert(limiter:consume("p1") == false, "only refilled tokens are available")
	now = 100
	assert(math.abs(limiter:remaining("p1") - 3) < 1e-9, "refill caps at capacity")
end

-- Retry: succeeds after transient failures, stops on non-retryable, bounded attempts.
do
	local sleeps = {}
	local calls = 0
	local ok, value, attempts = Retry.run(function()
		calls += 1
		if calls < 3 then
			return false, "busy"
		end
		return true, "done"
	end, { attempts = 5, sleep = function(seconds)
		table.insert(sleeps, seconds)
	end, random = function()
		return 0.5
	end })
	assert(ok and value == "done" and attempts == 3, "retry succeeds on third attempt")
	assert(#sleeps == 2 and sleeps[2] > sleeps[1], "backoff grows")
	local thrown = 0
	ok, value = Retry.run(function()
		thrown += 1
		error("explode")
	end, { attempts = 2, sleep = function() end })
	assert(not ok and thrown == 2 and string.find(tostring(value), "explode", 1, true), "thrown errors are retried and reported")
	local stopped = 0
	ok, value = Retry.run(function()
		stopped += 1
		return false, "fatal"
	end, { attempts = 5, sleep = function() end, shouldRetry = function(reason)
		return reason ~= "fatal"
	end })
	assert(not ok and stopped == 1 and value == "fatal", "non-retryable failure stops immediately")
end

print("PASS LabKit core: Signal, Trove, Schema, RateLimiter, Retry")
