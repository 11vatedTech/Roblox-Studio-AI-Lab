local CardCatalog = require(game:GetService("ReplicatedStorage"):WaitForChild("MisprintShared"):WaitForChild("CardCatalog"))

local CollectionRules = {}

function CollectionRules.newSession(userId)
	local ownedIds = {}
	local ownedSet = {}
	for _, cardId in ipairs(CardCatalog.getStarterIds()) do
		table.insert(ownedIds, cardId)
		ownedSet[cardId] = true
	end
	return {
		userId = userId,
		ownedIds = ownedIds,
		ownedSet = ownedSet,
		loadout = table.clone(ownedIds),
		unlockedChallenges = {},
	}
end

function CollectionRules.hasCard(session, cardId)
	return type(session) == "table" and type(cardId) == "string" and session.ownedSet[cardId] == true
end

function CollectionRules.validateLoadout(session, cardIds)
	if type(session) ~= "table" or type(cardIds) ~= "table" or #cardIds ~= 3 then
		return false, "loadout_size"
	end
	local seen = {}
	for index = 1, 3 do
		local cardId = cardIds[index]
		if type(cardId) ~= "string" or seen[cardId] then
			return false, "duplicate_or_invalid_card"
		end
		if not CollectionRules.hasCard(session, cardId) or not CardCatalog.get(cardId) then
			return false, "unowned_card"
		end
		seen[cardId] = true
	end
	for key in pairs(cardIds) do
		if type(key) ~= "number" or key < 1 or key > 3 or key % 1 ~= 0 then
			return false, "malformed_loadout"
		end
	end
	return true
end

function CollectionRules.unlock(session, cardId, challengeId)
	if type(session) ~= "table" or type(cardId) ~= "string" or type(challengeId) ~= "string" then
		return false
	end
	local definition = CardCatalog.get(cardId)
	if not definition or definition.starter or definition.unlockChallengeId ~= challengeId or session.ownedSet[cardId] then
		return false
	end
	session.ownedSet[cardId] = true
	table.insert(session.ownedIds, cardId)
	session.unlockedChallenges[challengeId] = true
	return true
end

return table.freeze(CollectionRules)
