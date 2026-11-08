local HudState = {}

function HudState.initial()
	return {
		screen = "index",
		phase = "index",
		ownedCardIds = {},
		loadout = {},
		queuedPlayerCount = 0,
		isQueued = false,
		isParticipant = false,
		activeSummonCount = 0,
		bossHealth = 0,
		bossMaxHealth = 0,
		objective = "Choose three pages and enter the hunt.",
		message = "",
		telegraph = "",
	}
end

local function copy(state)
	local result = {}
	for key, value in pairs(state) do result[key] = value end
	return result
end

local function copyArray(value, oldValue)
	if type(value) ~= "table" then return oldValue end
	local result = {}
	for index, item in ipairs(value) do
		if type(item) == "string" then result[#result + 1] = item end
	end
	return result
end

function HudState.reduce(state, payload)
	if type(state) ~= "table" or type(payload) ~= "table" or type(payload.kind) ~= "string" then
		return state
	end
	local nextState = copy(state)
	if payload.kind == "snapshot" then
		nextState.phase = type(payload.phase) == "string" and payload.phase or "index"
		nextState.screen = (nextState.phase == "index" or nextState.phase == "entry") and "index" or "encounter"
		nextState.ownedCardIds = copyArray(payload.ownedCardIds, state.ownedCardIds)
		nextState.loadout = copyArray(payload.loadout, state.loadout)
		nextState.queuedPlayerCount = math.max(0, tonumber(payload.queuedPlayerCount) or 0)
		nextState.isQueued = payload.isQueued == true
		nextState.isParticipant = payload.isParticipant == true
		nextState.activeSummonCount = math.max(0, tonumber(payload.activeSummonCount) or 0)
		nextState.bossHealth = math.max(0, tonumber(payload.bossHealth) or 0)
		nextState.bossMaxHealth = math.max(0, tonumber(payload.bossMaxHealth) or 0)
		nextState.message = type(payload.message) == "string" and payload.message or ""
	elseif payload.kind == "encounter_state" then
		nextState.screen = "encounter"
		nextState.phase = type(payload.phase) == "string" and payload.phase or state.phase
		nextState.bossHealth = math.max(0, tonumber(payload.bossHealth) or state.bossHealth)
		nextState.bossMaxHealth = math.max(0, tonumber(payload.bossMaxHealth) or state.bossMaxHealth)
		nextState.activeSummonCount = math.max(0, tonumber(payload.activeSummonCount) or state.activeSummonCount)
		nextState.objective = type(payload.objective) == "string" and payload.objective or state.objective
		nextState.message = type(payload.message) == "string" and payload.message or state.message
		nextState.telegraph = type(payload.telegraph) == "string" and payload.telegraph or ""
		if type(payload.ownedCardIds) == "table" then
			nextState.ownedCardIds = copyArray(payload.ownedCardIds, state.ownedCardIds)
		end
	elseif payload.kind == "party_waiting" then
		nextState.queuedPlayerCount = math.max(0, tonumber(payload.queuedPlayerCount) or state.queuedPlayerCount)
		nextState.message = "Party ready at the portal. Start when your team is set."
	elseif payload.kind == "call_rejected" or payload.kind == "intent_rejected" then
		nextState.message = type(payload.reason) == "string" and payload.reason or "request_rejected"
	elseif payload.kind == "card_unlocked" then
		nextState.message = type(payload.displayName) == "string" and (payload.displayName .. " joined your Index this session.") or "A new card joined your Index this session."
		if type(payload.ownedCardIds) == "table" then
			nextState.ownedCardIds = copyArray(payload.ownedCardIds, state.ownedCardIds)
		end
	else
		return state
	end
	return nextState
end

return table.freeze(HudState)
