local CollectionRules = require(script.Parent:WaitForChild("CollectionRules"))

local CollectionService = {}
CollectionService.__index = CollectionService

function CollectionService.new()
	return setmetatable({ sessions = {} }, CollectionService)
end

function CollectionService:ensure(player)
	local session = self.sessions[player.UserId]
	if not session then
		session = CollectionRules.newSession(player.UserId)
		self.sessions[player.UserId] = session
	end
	return session
end

function CollectionService:get(userId)
	return self.sessions[userId]
end

function CollectionService:remove(userId)
	self.sessions[userId] = nil
end

function CollectionService:setLoadout(player, cardIds)
	local session = self:ensure(player)
	local valid, reason = CollectionRules.validateLoadout(session, cardIds)
	if not valid then
		return false, reason
	end
	session.loadout = table.clone(cardIds)
	return true
end

function CollectionService:hasCard(userId, cardId)
	local session = self.sessions[userId]
	return session ~= nil and CollectionRules.hasCard(session, cardId)
end

function CollectionService:getLoadout(userId)
	local session = self.sessions[userId]
	return session and table.clone(session.loadout) or {}
end

function CollectionService:grantChallenge(userId, cardId, challengeId)
	local session = self.sessions[userId]
	if not session then
		return false
	end
	return CollectionRules.unlock(session, cardId, challengeId)
end

function CollectionService:getOwnedIds(userId)
	local session = self.sessions[userId]
	return session and table.clone(session.ownedIds) or {}
end

return CollectionService
