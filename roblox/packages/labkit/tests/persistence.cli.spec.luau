-- Roblox-free specs for PlayerData session locking, migrations, Economy, and Receipts.
local PlayerData = require("../src/PlayerData")
local Economy = require("../src/Economy")
local Receipts = require("../src/Receipts")

local now = 1000
local function clock()
	return now
end
local noSleep = function() end
local retry = { attempts = 3, baseDelay = 0, maxDelay = 0, sleep = noSleep }

local template = { coins = 0, settings = { music = true, sfx = true }, items = {} }
local adapter = PlayerData.memoryAdapter()

-- Load creates, reconciles, and locks.
local serverA = PlayerData.new({ adapter = adapter, template = template, jobId = "A", clock = clock, retry = retry })
local profile = assert(serverA:load("u1"))
assert(profile.Data.coins == 0 and profile.Data.settings.music == true, "new profile uses template")
profile.Data.coins = 50
assert(profile:save() == true, "save succeeds while holding the lock")
assert(adapter.peek("u1").data.coins == 50, "save persisted")

-- Second server cannot load while lock is fresh.
local serverB = PlayerData.new({ adapter = adapter, template = template, jobId = "B", clock = clock, retry = retry })
local blocked, reason = serverB:load("u1")
assert(blocked == nil and reason == "session_locked", "fresh lock blocks other servers: " .. tostring(reason))

-- Stale lock is stolen; old server detects loss on next save and stops writing.
now += 31 * 60
local stolen = assert(serverB:load("u1"))
assert(stolen.Data.coins == 50, "stealing server sees last saved data")
assert(stolen.Meta.stolenFrom == "A", "steal is recorded")
local releasedReason = nil
profile.Released:Connect(function(why)
	releasedReason = why
end)
profile.Data.coins = 999999
local saved, saveErr = profile:save()
assert(saved == false and saveErr == "session_lost", "old server cannot overwrite after losing the session")
assert(releasedReason == "session_lost" and not profile:isActive(), "loss is signalled so the game can kick")
assert(adapter.peek("u1").data.coins == 50, "duplicate-write was prevented")

-- Release clears the lock so the next server loads immediately.
assert(stolen:release() == true, "release succeeds")
assert(adapter.peek("u1").session == nil, "release clears session lock")
local again = assert(serverA:load("u1"))
again:release()

-- Migrations and newer-version refusal.
local v2 = PlayerData.new({
	adapter = adapter,
	template = { gold = 0, settings = { music = true, sfx = true, haptics = true }, items = {} },
	version = 2,
	migrations = {
		[1] = function(data)
			data.gold = data.coins
			data.coins = nil
			return data
		end,
	},
	jobId = "C",
	clock = clock,
	retry = retry,
})
local migrated = assert(v2:load("u1"))
assert(migrated.Data.gold == 50 and migrated.Data.coins == nil, "migration moved coins to gold")
assert(migrated.Data.settings.haptics == true and migrated.Data.settings.music == true, "nested template keys reconciled")
assert(migrated:release() == true)
local oldServer = PlayerData.new({ adapter = adapter, template = template, jobId = "D", clock = clock, retry = retry })
local refused, refusedReason = oldServer:load("u1")
assert(refused == nil and refusedReason == "data_from_newer_version", "old server refuses newer data")

-- Missing migration is a configuration error.
assert(not pcall(PlayerData.new, { adapter = adapter, template = template, version = 3, migrations = {} }), "missing migrations rejected")

-- Transient store failures are retried.
adapter.failNext(2)
local flaky = assert(serverA:load("u2"), "load survives two transient failures")
assert(flaky.loadAttempts == 3, "load used three attempts")
adapter.failNext(5)
local flakySave = flaky:save()
assert(flakySave == false and flaky:isActive(), "persistent failure reports but keeps the session")
assert(flaky:release() == true)

-- Validation hook rejects corrupt data without writing.
local strict = PlayerData.new({
	adapter = adapter,
	template = template,
	jobId = "E",
	clock = clock,
	retry = retry,
	validate = function(data)
		return type(data.coins) == "number" and data.coins >= 0, "coins"
	end,
})
local writesBefore = adapter.writes
local seeded = assert(strict:load("u3"))
seeded.Data.coins = -5
seeded:release()
local corrupt, corruptReason = strict:load("u3")
assert(corrupt == nil and corruptReason == "invalid_data", "invalid data refused")
assert(adapter.writes == writesBefore + 2, "refused load wrote nothing")

-- Economy ---------------------------------------------------------------------
local events = {}
local economy = Economy.new({
	currencies = { Coins = { max = 1000, starting = 10 }, Gems = { max = 100 } },
	clock = clock,
	onTransaction = function(event)
		table.insert(events, event.kind)
	end,
})
local wallet = {}
assert(economy:balance(wallet, "Coins") == 10, "starting balance")
assert(economy:grant(wallet, "Coins", 40, { idempotencyKey = "quest-1" }) == true)
local dupOk, dupReason = economy:grant(wallet, "Coins", 40, { idempotencyKey = "quest-1" })
assert(dupOk == true and dupReason == "duplicate" and economy:balance(wallet, "Coins") == 50, "idempotent grant applies once")
local spendOk, spendReason = economy:spend(wallet, "Coins", 51)
assert(spendOk == false and spendReason == "insufficient_funds", "cannot go negative")
assert(economy:spend(wallet, "Coins", 0.5) == false, "fractional amounts rejected")
assert(economy:spend(wallet, "Coins", 0 / 0) == false, "NaN rejected")
assert(economy:grant(wallet, "Coins", 2000) == false, "cap enforced")
assert(economy:grant(wallet, "Tokens", 1) == false, "unknown currency rejected")
local atomicOk = economy:apply(wallet, { Coins = -10, Gems = -1 })
assert(atomicOk == false and economy:balance(wallet, "Coins") == 50, "multi-currency apply is all-or-nothing")
local bought = economy:purchase(wallet, { Coins = 30 }, function(data)
	data.items = { sword = 1 }
	return true
end, { idempotencyKey = "buy-sword-1" })
assert(bought == true and wallet.items.sword == 1 and economy:balance(wallet, "Coins") == 20, "purchase charges and grants")
local failedBuy, failedReason = economy:purchase(wallet, { Coins = 10 }, function()
	error("grant crashed")
end, { idempotencyKey = "buy-shield-1" })
assert(failedBuy == false and failedReason == "grant_failed" and economy:balance(wallet, "Coins") == 20, "failed grant refunds")
assert(table.find(wallet.ledger.keys, "buy-shield-1") == nil, "failed purchase does not consume its key")
assert(table.find(events, "refund") ~= nil, "refund is audited")

-- Receipts --------------------------------------------------------------------
local shopStore = PlayerData.new({ adapter = adapter, template = { gems = 0 }, jobId = "S", clock = clock, retry = retry })
local buyer = assert(shopStore:load("42"))
local grants = 0
local receipts = Receipts.new({
	getProfile = function(userId)
		return shopStore:get(tostring(userId))
	end,
	products = {
		[1001] = function(p)
			grants += 1
			p.Data.gems += 100
			return true
		end,
	},
})
local info = { PurchaseId = "R-1", PlayerId = 42, ProductId = 1001 }
assert(receipts:process(info) == "granted", "first receipt granted")
assert(receipts:process(info) == "granted" and grants == 1, "replayed receipt is not granted twice")
assert(adapter.peek("42").data.gems == 100 and table.find(adapter.peek("42").meta.receipts, "R-1"), "grant and marker saved together")
adapter.failNext(3)
assert(receipts:process({ PurchaseId = "R-2", PlayerId = 42, ProductId = 1001 }) == "retry", "save failure returns retry")
assert(grants == 2, "grant happened once in memory")
assert(receipts:process({ PurchaseId = "R-2", PlayerId = 42, ProductId = 1001 }) == "granted" and grants == 2, "retry saves without re-granting")
assert(receipts:process({ PurchaseId = "R-3", PlayerId = 7, ProductId = 1001 }) == "retry", "absent profile retries")
assert(receipts:process({ PurchaseId = "R-4", PlayerId = 42, ProductId = 9 }) == "retry", "unknown product retries")
buyer:release()

print("PASS LabKit persistence: session locks, steal/loss, migrations, retries, economy, receipts")
