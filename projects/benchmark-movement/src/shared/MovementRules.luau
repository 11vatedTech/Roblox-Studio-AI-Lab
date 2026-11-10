local MovementRules = {}

local function finite(value)
	return type(value) == "number" and value == value and math.abs(value) < math.huge
end

function MovementRules.validateCheckpoint(state, checkpointIndex, distance, now, maximumApproach, maximumGap)
	if type(state) ~= "table" or not finite(checkpointIndex) or not finite(distance) or not finite(now) or not finite(maximumApproach) or not finite(maximumGap) then return nil, "malformed" end
	if checkpointIndex ~= math.floor(checkpointIndex) or checkpointIndex < 1 then return nil, "invalid_checkpoint" end
	if distance < 0 or maximumApproach <= 0 or maximumGap <= 0 then return nil, "invalid_distance" end
	if checkpointIndex ~= state.nextCheckpoint then return nil, "out_of_order" end
	if distance > maximumApproach then return nil, "too_far" end
	if not finite(state.lastCheckpointAt) or now < state.lastCheckpointAt then return nil, "time_reversed" end
	if checkpointIndex > 1 and now - state.lastCheckpointAt > maximumGap then return nil, "checkpoint_timeout" end
	return { nextCheckpoint = checkpointIndex + 1, lastCheckpointAt = now, finishIndex = state.finishIndex, completed = state.finishIndex == checkpointIndex }
end

function MovementRules.validateDisplacement(previousDistance, currentDistance, elapsed, maxStudsPerSecond)
	if not finite(previousDistance) or not finite(currentDistance) or not finite(elapsed) or not finite(maxStudsPerSecond) or elapsed <= 0 or maxStudsPerSecond <= 0 then
		return false, "malformed"
	end
	if currentDistance < previousDistance then return false, "backtrack" end
	if currentDistance - previousDistance > elapsed * maxStudsPerSecond then return false, "impossible_displacement" end
	return true
end

return table.freeze(MovementRules)
