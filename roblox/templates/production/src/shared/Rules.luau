--!strict
-- Pure gameplay rules shared by server and client. The server is the authority; the
-- client uses the same functions only to display prices and previews. Roblox-free so
-- the CLI specs in tests/ exercise the exact code the game runs.

local Rules = {}

function Rules.upgradeCost(config, upgradeId, currentLevel)
	local upgrade = config.upgrades[upgradeId]
	if upgrade == nil then
		return nil, "unknown_upgrade"
	end
	if type(currentLevel) ~= "number" or currentLevel < 0 or currentLevel % 1 ~= 0 then
		return nil, "invalid_level"
	end
	if currentLevel >= upgrade.maxLevel then
		return nil, "max_level"
	end
	return math.floor(upgrade.baseCost * upgrade.costGrowth ^ currentLevel + 0.5)
end

function Rules.level(data, upgradeId)
	local levels = data.upgrades or {}
	return levels[upgradeId] or 0
end

function Rules.pickupRadius(config, data)
	return config.world.pickupRadius + Rules.level(data, "Magnet") * config.upgrades.Magnet.effectPerLevel
end

function Rules.orbReward(config, data)
	local multiplier = 1 + Rules.level(data, "Value") * config.upgrades.Value.effectPerLevel
	return math.max(1, math.floor(config.world.baseReward * multiplier + 0.5))
end

function Rules.walkSpeed(config, data)
	return config.baseWalkSpeed + Rules.level(data, "Speed") * config.upgrades.Speed.effectPerLevel
end

-- Decides whether a character whose root is at `playerPosition` (read on the server)
-- collects an orb at `orbPosition`. Positions are {X, Y, Z} tables or Vector3 values.
-- Both positions come from the server, so no client value is trusted.
function Rules.canCollect(config, data, playerPosition, orbPosition, orbActive)
	if not orbActive then
		return false, "orb_inactive"
	end
	local dx = playerPosition.X - orbPosition.X
	local dy = playerPosition.Y - orbPosition.Y
	local dz = playerPosition.Z - orbPosition.Z
	local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
	if distance ~= distance then
		return false, "invalid_position"
	end
	if distance > Rules.pickupRadius(config, data) then
		return false, "too_far"
	end
	return true
end

-- Produces deterministic orb positions inside the field for a seed.
function Rules.orbLayout(config, rng)
	local positions = {}
	local radius = config.world.fieldRadius
	for _ = 1, config.world.orbCount do
		local angle = rng:number(0, math.pi * 2)
		local distance = math.sqrt(rng:next()) * radius
		table.insert(positions, {
			X = math.cos(angle) * distance,
			Y = config.world.orbHeight,
			Z = math.sin(angle) * distance,
		})
	end
	return positions
end

-- Client-safe snapshot of the player's state for UI replication.
function Rules.snapshot(config, data)
	local upgrades = {}
	for _, upgradeId in ipairs(config.upgradeOrder) do
		local level = Rules.level(data, upgradeId)
		local cost = Rules.upgradeCost(config, upgradeId, level)
		table.insert(upgrades, { id = upgradeId, level = level, maxLevel = config.upgrades[upgradeId].maxLevel, cost = cost })
	end
	return {
		coins = (data.wallet and data.wallet[config.currency]) or 0,
		upgrades = upgrades,
		settings = data.settings,
		stats = data.stats,
	}
end

return Rules
