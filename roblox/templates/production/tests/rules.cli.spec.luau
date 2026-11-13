-- Roblox-free specs for the production template's shared rules.
local GameConfig = require("../src/shared/GameConfig")
local Rules = require("../src/shared/Rules")

-- Upgrade pricing
assert(Rules.upgradeCost(GameConfig, "Value", 0) == 30, "first Value upgrade costs base")
assert(Rules.upgradeCost(GameConfig, "Value", 1) == 54, "cost grows geometrically and rounds")
local maxed, maxReason = Rules.upgradeCost(GameConfig, "Magnet", GameConfig.upgrades.Magnet.maxLevel)
assert(maxed == nil and maxReason == "max_level", "max level has no price")
local unknown, unknownReason = Rules.upgradeCost(GameConfig, "Admin", 0)
assert(unknown == nil and unknownReason == "unknown_upgrade", "unknown upgrades are rejected")
assert(Rules.upgradeCost(GameConfig, "Value", -1) == nil and Rules.upgradeCost(GameConfig, "Value", 0.5) == nil, "invalid levels rejected")

-- Every purchasable level has a finite, increasing price
for _, upgradeId in ipairs(GameConfig.upgradeOrder) do
	local previous = 0
	for level = 0, GameConfig.upgrades[upgradeId].maxLevel - 1 do
		local cost = Rules.upgradeCost(GameConfig, upgradeId, level)
		assert(cost ~= nil and cost > previous and cost < GameConfig.currencyCap, upgradeId .. " price curve")
		previous = cost
	end
end

-- Effects
local data = { upgrades = { Value = 2, Magnet = 1, Speed = 3 }, wallet = { Coins = 120 }, settings = {}, stats = {} }
assert(Rules.orbReward(GameConfig, data) == 8, "reward scales with Value (5 * 1.5 = 7.5 -> 8)")
assert(Rules.orbReward(GameConfig, { upgrades = {} }) == GameConfig.world.baseReward, "base reward with no upgrades")
assert(Rules.pickupRadius(GameConfig, data) == GameConfig.world.pickupRadius + 3, "magnet widens pickup radius")
assert(Rules.walkSpeed(GameConfig, data) == 22, "speed upgrade adds walk speed")

-- Server-side collection validation
local near = { X = 0, Y = 4.5, Z = 5 }
local orb = { X = 0, Y = 4, Z = 0 }
assert(Rules.canCollect(GameConfig, data, near, orb, true) == true, "nearby active orb collectable")
local edge = Rules.canCollect(GameConfig, { upgrades = {} }, { X = 0, Y = 4, Z = GameConfig.world.pickupRadius + 0.5 }, orb, true)
assert(edge == false, "just outside the base radius is not collected without Magnet")
assert(Rules.canCollect(GameConfig, data, { X = 0, Y = 4, Z = GameConfig.world.pickupRadius + 0.5 }, orb, true) == true, "Magnet collects the same orb")
local far, farReason = Rules.canCollect(GameConfig, data, { X = 0, Y = 4, Z = 200 }, orb, true)
assert(far == false and farReason == "too_far", "distant collection rejected")
local inactive, inactiveReason = Rules.canCollect(GameConfig, data, near, orb, false)
assert(inactive == false and inactiveReason == "orb_inactive", "inactive orb rejected")
local nan = 0 / 0
local bad, badReason = Rules.canCollect(GameConfig, data, { X = nan, Y = 0, Z = 0 }, orb, true)
assert(bad == false and badReason == "invalid_position", "NaN position rejected")

-- Layout stays inside the field and is deterministic for a deterministic generator
local function sequence(seed)
	local state = seed
	return {
		next = function()
			state = (state * 48271) % 2147483647
			return state / 2147483647
		end,
		number = function(self, min, max)
			return min + self.next() * (max - min)
		end,
	}
end
local layoutA = Rules.orbLayout(GameConfig, sequence(7))
local layoutB = Rules.orbLayout(GameConfig, sequence(7))
assert(#layoutA == GameConfig.world.orbCount, "orb count")
for index, position in ipairs(layoutA) do
	local radius = math.sqrt(position.X * position.X + position.Z * position.Z)
	assert(radius <= GameConfig.world.fieldRadius + 1e-9, "orb inside field")
	assert(position.X == layoutB[index].X and position.Z == layoutB[index].Z, "layout deterministic")
end

-- Snapshot exposes only display data
local snapshot = Rules.snapshot(GameConfig, data)
assert(snapshot.coins == 120 and #snapshot.upgrades == #GameConfig.upgradeOrder, "snapshot shape")
assert(snapshot.upgrades[1].id == "Value" and snapshot.upgrades[1].cost == Rules.upgradeCost(GameConfig, "Value", 2), "snapshot prices")
assert(snapshot.ledger == nil and snapshot.wallet == nil, "internal ledger is not replicated")

print("PASS production template rules: pricing, effects, collection validation, layout, snapshot")
