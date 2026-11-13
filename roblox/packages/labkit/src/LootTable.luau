--!strict
-- LabKit.LootTable
-- Weighted drops with rarity tiers, published odds, and pity (guaranteed rarity after
-- N misses). Roblox requires experiences that sell random items for Robux to disclose
-- odds; `odds()` returns the exact base probability of each entry and tier so the UI
-- can show them. Pity state is plain data and belongs in the player's profile.

local LootTable = {}
LootTable.__index = LootTable

function LootTable.new(definition)
	assert(type(definition) == "table" and type(definition.entries) == "table", "LootTable.new expects entries")
	local total = 0
	local seenIds = {}
	for _, entry in ipairs(definition.entries) do
		assert(type(entry.id) == "string", "loot entries need string ids")
		assert(not seenIds[entry.id], "duplicate loot id " .. entry.id)
		seenIds[entry.id] = true
		assert(type(entry.weight) == "number" and entry.weight > 0, "loot weights must be positive")
		total += entry.weight
	end
	assert(total > 0, "loot table needs entries")
	local pity = definition.pity or {}
	for rarity, rule in pairs(pity) do
		assert(type(rule.threshold) == "number" and rule.threshold >= 1 and rule.threshold % 1 == 0, "pity threshold must be a positive integer")
		local found = false
		for _, entry in ipairs(definition.entries) do
			if entry.rarity == rarity then
				found = true
			end
		end
		assert(found, "pity rarity " .. rarity .. " has no entries")
	end
	return setmetatable({ entries = definition.entries, total = total, pity = pity }, LootTable)
end

function LootTable:odds()
	local byId = {}
	local byRarity = {}
	for _, entry in ipairs(self.entries) do
		local probability = entry.weight / self.total
		byId[entry.id] = probability
		if entry.rarity then
			byRarity[entry.rarity] = (byRarity[entry.rarity] or 0) + probability
		end
	end
	return { byId = byId, byRarity = byRarity }
end

local function pickFrom(rng, entries)
	local weighted = {}
	for _, entry in ipairs(entries) do
		table.insert(weighted, { value = entry, weight = entry.weight })
	end
	return (rng:weighted(weighted))
end

-- Rolls once. `pityState` is a table { [rarity] = missesSinceLastHit } and is updated
-- in place. Returns the entry and whether pity forced it.
function LootTable:roll(rng, pityState)
	local state = pityState or {}
	local forcedRarity = nil
	local rarities = {}
	for rarity in pairs(self.pity) do
		table.insert(rarities, rarity)
	end
	table.sort(rarities, function(a, b)
		return self.pity[a].threshold > self.pity[b].threshold
	end)
	for _, rarity in ipairs(rarities) do
		if (state[rarity] or 0) + 1 >= self.pity[rarity].threshold then
			forcedRarity = rarity
			break
		end
	end
	local entry
	if forcedRarity ~= nil then
		local pool = {}
		for _, candidate in ipairs(self.entries) do
			if candidate.rarity == forcedRarity then
				table.insert(pool, candidate)
			end
		end
		entry = pickFrom(rng, pool)
	else
		entry = pickFrom(rng, self.entries)
	end
	for rarity in pairs(self.pity) do
		if entry.rarity == rarity then
			state[rarity] = 0
		else
			state[rarity] = (state[rarity] or 0) + 1
		end
	end
	return entry, forcedRarity ~= nil
end

return LootTable
