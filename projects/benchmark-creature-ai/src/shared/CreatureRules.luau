local CreatureRules = {}

local function finite(value)
	return type(value) == "number" and value == value and math.abs(value) < math.huge
end

function CreatureRules.step(state, playerDistance, now, tuning)
	if type(state) ~= "table" or type(tuning) ~= "table" or not finite(playerDistance) or not finite(now) then return nil, "malformed" end
	if playerDistance < 0 or not finite(state.startedAt) or now < state.startedAt then return nil, "invalid_time_or_distance" end
	local durations = { telegraph = tuning.telegraph, attack = tuning.attack, recover = tuning.recover }
	for phase, duration in pairs(durations) do
		if not finite(duration) or duration <= 0 then return nil, "invalid_" .. phase .. "_duration" end
	end
	local elapsed = now - state.startedAt
	if state.phase == "idle" and playerDistance <= tuning.noticeRange then
		return { phase = "telegraph", startedAt = now, attackCount = state.attackCount or 0 }
	elseif state.phase == "telegraph" and elapsed >= tuning.telegraph then
		return { phase = "attack", startedAt = state.startedAt, attackCount = (state.attackCount or 0) + 1 }
	elseif state.phase == "attack" and elapsed >= tuning.telegraph + tuning.attack then
		return { phase = "recover", startedAt = state.startedAt, attackCount = state.attackCount }
	elseif state.phase == "recover" and elapsed >= tuning.telegraph + tuning.attack + tuning.recover then
		return { phase = playerDistance <= tuning.noticeRange and "telegraph" or "idle", startedAt = now, attackCount = state.attackCount }
	elseif state.phase ~= "idle" and state.phase ~= "telegraph" and state.phase ~= "attack" and state.phase ~= "recover" then
		return nil, "unknown_phase"
	end
	return state
end

return table.freeze(CreatureRules)
