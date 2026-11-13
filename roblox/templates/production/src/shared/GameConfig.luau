--!strict
-- Versioned game configuration. Everything a designer tunes lives here; server rules
-- read it, clients only display it. Bump `dataVersion` and add a migration in
-- server/DataService when the saved shape changes.

local GameConfig = {
	dataVersion = 1,
	dataStoreName = "PlayerData_v1",
	autosaveSeconds = 60,

	currency = "Coins",
	currencyCap = 1e12,
	startingCoins = 0,

	world = {
		seed = "production-template",
		orbCount = 24,
		fieldRadius = 70,
		orbHeight = 4,
		respawnSeconds = 6,
		baseReward = 5,
		collectDistance = 14,
	},

	-- Upgrades are bought with Coins. Each level multiplies the effect.
	upgrades = {
		Magnet = {
			displayName = "Magnet",
			description = "Collect orbs from farther away.",
			maxLevel = 5,
			baseCost = 50,
			costGrowth = 2.2,
			effectPerLevel = 3, -- studs of extra collect distance
		},
		Value = {
			displayName = "Orb Value",
			description = "Each orb is worth more.",
			maxLevel = 10,
			baseCost = 30,
			costGrowth = 1.8,
			effectPerLevel = 0.25, -- +25% reward per level
		},
		Speed = {
			displayName = "Swift Boots",
			description = "Move faster.",
			maxLevel = 4,
			baseCost = 80,
			costGrowth = 2.5,
			effectPerLevel = 2, -- walk speed
		},
	},
	upgradeOrder = { "Value", "Magnet", "Speed" },

	-- Developer products. IDs are nil until the owner creates the products on the
	-- Creator Dashboard; nil entries are never offered. No purchase is enabled by default.
	products = {
		CoinPackSmall = { productId = nil, coins = 500 },
	},

	baseWalkSpeed = 16,
}

return GameConfig
