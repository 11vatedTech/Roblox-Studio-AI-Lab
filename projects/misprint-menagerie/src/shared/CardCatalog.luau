local definitions = {
	{
		id = "girdle_9",
		displayName = "Girdle-9, the Door-Knight",
		style = "mech",
		role = "cover",
		cooldownSeconds = 7,
		arrivalEffect = "Crashes through a stamped gate and unfolds a shield plate.",
		combatBehavior = "Charges the Redactor, then leaves temporary cover across one marked lane.",
		shortAbility = "Blocks a marked erasure with a shield.",
		starter = true,
	},
	{
		id = "nib_and_nuzzle",
		displayName = "Nib & Nuzzle",
		style = "chibi duo",
		role = "combo",
		cooldownSeconds = 5,
		arrivalEffect = "Two tiny ink-stamped friends tumble in on a shared ribbon.",
		combatBehavior = "Chains a quick two-hit combo when another summon has acted recently.",
		shortAbility = "Combos after another page is called.",
		starter = true,
	},
	{
		id = "morrowbell",
		displayName = "Morrowbell",
		style = "ghost",
		role = "weak point",
		cooldownSeconds = 8,
		arrivalEffect = "A translucent bell silhouette rings once and phases into view.",
		combatBehavior = "Crosses a danger window and marks the boss's weak point for allied attacks.",
		shortAbility = "Marks a weak point for allied hits.",
		starter = true,
	},
	{
		id = "foldwyn_pagewing",
		displayName = "Foldwyn, Pagewing",
		style = "origami",
		role = "barrier",
		cooldownSeconds = 9,
		arrivalEffect = "A folded page spirals down and opens into a broad wing.",
		combatBehavior = "Unfolds a temporary barrier or connected safe path across a threatened zone.",
		shortAbility = "Unfolds a one-use safe-path barrier.",
		unlockChallengeId = "fold_the_blank",
	},
	{
		id = "buttongrin",
		displayName = "Buttongrin",
		style = "plush guardian",
		role = "intercept",
		cooldownSeconds = 10,
		arrivalEffect = "A stitched guardian bounces into place and braces its button eyes.",
		combatBehavior = "Intercepts a targeted hit and returns stored force as a short stagger.",
		shortAbility = "Intercepts a stamp and staggers the boss.",
		unlockChallengeId = "hold_the_line",
	},
	{
		id = "sableline",
		displayName = "Sableline",
		style = "ink puppet",
		role = "decoy",
		cooldownSeconds = 8,
		arrivalEffect = "A fine black thread traces a tall puppet from a shifting ink line.",
		combatBehavior = "Draws a decoy or binding trail that redirects or briefly constrains the boss.",
		shortAbility = "Baits a stamp with an ink decoy.",
		unlockChallengeId = "trace_the_echo",
	},
}

local byId = {}
local starterIds = {}
for _, definition in ipairs(definitions) do
	byId[definition.id] = definition
	if definition.starter then
		table.insert(starterIds, definition.id)
	end
end

local function copyDefinition(definition)
	local copy = {}
	for key, value in pairs(definition) do
		copy[key] = value
	end
	return copy
end

local CardCatalog = {}

function CardCatalog.getAll()
	local result = table.create(#definitions)
	for index, definition in ipairs(definitions) do
		result[index] = copyDefinition(definition)
	end
	return result
end

function CardCatalog.get(cardId)
	if type(cardId) ~= "string" then
		return nil
	end
	local definition = byId[cardId]
	return definition and copyDefinition(definition) or nil
end

function CardCatalog.getStarterIds()
	return table.clone(starterIds)
end

return table.freeze(CardCatalog)
