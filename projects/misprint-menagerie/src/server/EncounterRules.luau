local EncounterRules = {}

local nextPhase = {
	entry = "phase_one",
	phase_one = "phase_two",
	phase_two = "reward",
	reward = "closed",
	failed = "closed",
}

local canFail = { phase_one = true, phase_two = true }

function EncounterRules.new(playerUserIds)
	assert(type(playerUserIds) == "table", "playerUserIds must be an array")
	local state = {
		phase = "entry",
		players = {},
		activeSummons = {},
		knockedOut = {},
		rewarded = {},
	}
	for _, userId in ipairs(playerUserIds) do
		assert(type(userId) == "number" and userId > 0, "user IDs must be positive numbers")
		assert(not state.players[userId], "player IDs must be unique")
		state.players[userId] = true
		state.activeSummons[userId] = {}
		state.knockedOut[userId] = false
	end
	return state
end

function EncounterRules.transition(state, phase)
	if type(state) ~= "table" or (nextPhase[state.phase] ~= phase and not (phase == "failed" and canFail[state.phase])) then
		return false
	end
	state.phase = phase
	return true
end

function EncounterRules.setKnockedOut(state, userId, isKnockedOut)
	if type(state) ~= "table" or not state.players[userId] or type(isKnockedOut) ~= "boolean" then
		return false
	end
	state.knockedOut[userId] = isKnockedOut
	return true
end

function EncounterRules.allKnockedOut(state)
	if type(state) ~= "table" then
		return false
	end
	local count = 0
	for userId in pairs(state.players) do
		count += 1
		if not state.knockedOut[userId] then
			return false
		end
	end
	return count > 0
end

function EncounterRules.removePlayer(state, userId)
	if type(state) ~= "table" or not state.players[userId] then
		return false
	end
	state.players[userId] = nil
	state.activeSummons[userId] = nil
	state.knockedOut[userId] = nil
	state.rewarded[userId] = nil
	return true
end

function EncounterRules.tryGrantReward(state, userId)
	if type(state) ~= "table" or state.phase ~= "reward" or not state.players[userId] or state.rewarded[userId] then
		return false
	end
	state.rewarded[userId] = true
	return true
end

return table.freeze(EncounterRules)
