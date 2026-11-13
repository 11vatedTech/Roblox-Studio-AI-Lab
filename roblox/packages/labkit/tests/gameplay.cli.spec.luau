-- Roblox-free specs for Inventory, StateMachine, Rng, LootTable, Spring, Theme, and Create.
local Inventory = require("../src/Inventory")
local StateMachine = require("../src/StateMachine")
local Rng = require("../src/Rng")
local LootTable = require("../src/LootTable")
local Spring = require("../src/Spring")
local Theme = require("../src/Theme")
local Create = require("../src/Create")

-- Inventory
do
	local inventory = Inventory.new({
		potion = { maxStack = 10, name = "Potion" },
		sword = { maxStack = 1 },
		crown = { unique = true },
	}, { capacity = 3 })
	local data = {}
	assert(inventory:add(data, "potion", 15), "stack across two slots")
	assert(inventory:slotsUsed(data) == 2, "15 potions use 2 slots")
	assert(inventory:add(data, "potion", 5), "filling an existing stack uses no new slot")
	assert(inventory:slotsUsed(data) == 2)
	assert(inventory:add(data, "sword"), "third slot")
	local full, fullReason = inventory:add(data, "potion", 1)
	assert(full == false and fullReason == "inventory_full", "capacity enforced")
	local fake, fakeReason = inventory:add(data, "admin_wand", 1)
	assert(fake == false and fakeReason == "unknown_item", "unknown items rejected")
	assert(inventory:add(data, "potion", -1) == false and inventory:add(data, "potion", 0 / 0) == false, "invalid counts rejected")
	local short, shortReason = inventory:remove(data, "potion", 21)
	assert(short == false and shortReason == "insufficient_items", "cannot remove more than owned")
	assert(inventory:remove(data, "sword") and inventory:count(data, "sword") == 0 and data.items.sword == nil, "removal clears empty entries")
	assert(inventory:add(data, "crown") and inventory:add(data, "crown") == false, "unique items cannot stack")
	local listed = inventory:list(data)
	assert(listed[1].id == "crown" and listed[2].name == "Potion", "list is sorted and named")
end

-- StateMachine
do
	local now = 0
	local log = {}
	local machine = StateMachine.new({
		initial = "Lobby",
		clock = function()
			return now
		end,
		states = {
			Lobby = {
				transitions = { "Countdown" },
				enter = function()
					table.insert(log, "enter Lobby")
				end,
				exit = function()
					table.insert(log, "exit Lobby")
				end,
			},
			Countdown = {
				transitions = { "Round", "Lobby" },
				guard = function(_, _, players)
					return (players or 0) >= 2
				end,
			},
			Round = {
				transitions = { "Results" },
				enter = function(_, previous)
					table.insert(log, "enter Round from " .. previous)
				end,
			},
			Results = { transitions = { "Lobby" } },
		},
	})
	local ok, reason = machine:transition("Round")
	assert(ok == false and reason == "transition_not_allowed", "undeclared transition rejected")
	ok, reason = machine:transition("Countdown", 1)
	assert(ok == false and reason == "guard_rejected", "guard vetoes")
	local changed = nil
	machine.Changed:Connect(function(state)
		changed = state
	end)
	assert(machine:transition("Countdown", 4) and changed == "Countdown", "guarded transition passes")
	now = 10
	assert(machine:timeInState() == 10, "time in state")
	assert(machine:transition("Round") and machine:is("Round"))
	assert(table.concat(log, "|") == "enter Lobby|exit Lobby|enter Round from Countdown", table.concat(log, "|"))
	assert(not pcall(StateMachine.new, { initial = "A", states = { A = { transitions = { "Missing" } } } }), "undeclared targets fail at definition")
end

-- Rng determinism and distribution sanity
do
	local a = Rng.new("world-seed-7")
	local b = Rng.new("world-seed-7")
	for _ = 1, 100 do
		assert(a:nextUInt32() == b:nextUInt32(), "same seed, same sequence")
	end
	assert(Rng.hashString("") == 2166136261, "FNV offset basis")
	assert(Rng.hashString("a") == 3826002220, "FNV-1a known vector for 'a'")
	local rng = Rng.new(12345)
	local buckets = { 0, 0, 0, 0 }
	for _ = 1, 4000 do
		local value = rng:integer(1, 4)
		assert(value >= 1 and value <= 4, "integer stays in range")
		buckets[value] += 1
	end
	for index = 1, 4 do
		assert(buckets[index] > 850 and buckets[index] < 1150, "roughly uniform bucket " .. index .. "=" .. buckets[index])
	end
	local shuffled = rng:shuffle({ 1, 2, 3, 4, 5, 6 })
	local sum = 0
	for _, value in ipairs(shuffled) do
		sum += value
	end
	assert(#shuffled == 6 and sum == 21, "shuffle is a permutation")
	local forkA = Rng.new(9):fork("loot")
	local forkB = Rng.new(9):fork("loot")
	assert(forkA:next() == forkB:next(), "forks are deterministic")
end

-- LootTable odds and pity
do
	local loot = LootTable.new({
		entries = {
			{ id = "stick", weight = 70, rarity = "common" },
			{ id = "blade", weight = 25, rarity = "rare" },
			{ id = "crown", weight = 5, rarity = "legendary" },
		},
		pity = { legendary = { threshold = 10 } },
	})
	local odds = loot:odds()
	assert(math.abs(odds.byId.crown - 0.05) < 1e-12 and math.abs(odds.byRarity.common - 0.7) < 1e-12, "published odds are exact")
	local rng = Rng.new(1)
	local pity = {}
	local longestDrought = 0
	local drought = 0
	local forcedCount = 0
	for _ = 1, 2000 do
		local entry, forced = loot:roll(rng, pity)
		if forced then
			forcedCount += 1
		end
		if entry.rarity == "legendary" then
			drought = 0
		else
			drought += 1
			longestDrought = math.max(longestDrought, drought)
		end
	end
	assert(longestDrought <= 9, "pity guarantees a legendary within 10 rolls; drought=" .. longestDrought)
	assert(forcedCount > 0, "pity triggered at least once")
	assert(not pcall(LootTable.new, { entries = { { id = "x", weight = 1 } }, pity = { epic = { threshold = 5 } } }), "pity for a missing rarity is rejected")
end

-- Spring frame-rate independence
do
	local fast = Spring.new(0, { speed = 10, damping = 1 })
	local slow = Spring.new(0, { speed = 10, damping = 1 })
	fast:setTarget(1)
	slow:setTarget(1)
	for _ = 1, 240 do
		fast:update(1 / 240)
	end
	for _ = 1, 30 do
		slow:update(1 / 30)
	end
	assert(math.abs(fast.position - slow.position) < 1e-6, "same result at 240 and 30 FPS")
	assert(fast.position > 0.99 and fast.position <= 1.0001, "critically damped spring settles without overshoot")
	local bouncy = Spring.new(0, { speed = 20, damping = 0.2 })
	bouncy:setTarget(1)
	local peak = 0
	for _ = 1, 60 do
		peak = math.max(peak, bouncy:update(1 / 60))
	end
	assert(peak > 1.2, "underdamped spring overshoots")
end

-- Theme accessibility
do
	assert(Theme.contrast(Theme.rgb("text"), Theme.rgb("background")) >= 7, "body text meets WCAG AAA on background")
	assert(Theme.contrast(Theme.rgb("textMuted"), Theme.rgb("surface")) >= 4.5, "muted text meets WCAG AA on surface")
	assert(Theme.contrast(Theme.rgb("primaryText"), Theme.rgb("primary")) >= 4.5, "primary button text meets WCAG AA")
	assert(Theme.textSize("caption", 360) >= 12, "text never drops below 12px")
	assert(Theme.minTouchTarget >= 44, "touch targets meet the mobile minimum")
end

-- Create with an injected factory
do
	local made = {}
	local function factory(className)
		local instance = { ClassName = className, Activated = { handlers = {} } }
		function instance.Activated:Connect(fn)
			table.insert(self.handlers, fn)
		end
		table.insert(made, instance)
		return instance
	end
	local build = Create.withFactory(factory)
	local root = {}
	local clicked = false
	local button = build("TextButton", {
		Text = "Play",
		Parent = root,
		[Create.Event("Activated")] = function()
			clicked = true
		end,
		[Create.Children] = { build("UICorner", {}) },
	})
	assert(button.Text == "Play" and button.Parent == root, "properties and parent applied")
	assert(made[1].ClassName == "UICorner" and made[1].Parent == button, "children parented to the instance")
	button.Activated.handlers[1]()
	assert(clicked, "event handler connected")
end

print("PASS LabKit gameplay: inventory, state machine, rng, loot odds/pity, spring, theme, create")
