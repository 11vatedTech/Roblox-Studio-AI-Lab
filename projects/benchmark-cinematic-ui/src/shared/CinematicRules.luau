local CinematicRules = {}

local MAX_CUES = 16
local MAX_CUE_DURATION = 30

local function finiteNumber(value)
	return type(value) == "number" and value == value and value > -math.huge and value < math.huge
end

local function validCues(cues)
	if type(cues) ~= "table" or #cues == 0 or #cues > MAX_CUES then return false end
	local ids = {}
	for _, cue in ipairs(cues) do
		if type(cue) ~= "table" or type(cue.id) ~= "string" or not cue.id:match("%S")
			or ids[cue.id] or not finiteNumber(cue.duration) or cue.duration < 0 or cue.duration > MAX_CUE_DURATION then
			return false
		end
		ids[cue.id] = true
	end
	return true
end

function CinematicRules.advance(state, cues, now, skipRequested, reducedMotion)
	if not validCues(cues) or type(state) ~= "table" or not finiteNumber(state.index)
		or state.index ~= math.floor(state.index) or not finiteNumber(state.startedAt)
		or not finiteNumber(now) or state.startedAt < 0 or now < 0
		or type(skipRequested) ~= "boolean" or type(reducedMotion) ~= "boolean" then
		return nil, "malformed"
	end
	if state.index < 1 or state.index > #cues + 1 or now < state.startedAt then return nil, "invalid_state" end
	if skipRequested then return { index = #cues + 1, startedAt = now, complete = true, reducedMotion = reducedMotion } end
	if state.index > #cues then return { index = state.index, startedAt = now, complete = true, reducedMotion = reducedMotion } end
	local duration = reducedMotion and math.min(cues[state.index].duration, 0.05) or cues[state.index].duration
	if now - state.startedAt + 1e-6 < duration then return { index = state.index, startedAt = state.startedAt, complete = false, reducedMotion = reducedMotion } end
	local nextIndex = state.index + 1
	return { index = nextIndex, startedAt = now, complete = nextIndex > #cues, reducedMotion = reducedMotion }
end

return table.freeze(CinematicRules)
