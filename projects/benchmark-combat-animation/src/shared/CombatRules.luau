local CombatRules = {}

local function finite(value)
	return type(value) == "number" and value == value and math.abs(value) < math.huge
end

function CombatRules.advance(state, now, tuning)
	if type(state) ~= "table" or not finite(now) or type(tuning) ~= "table" then
		return nil, "malformed"
	end
	local phases = { idle = true, windup = true, active = true, recovery = true }
	if not phases[state.phase] or not finite(state.startedAt) or not finite(tuning.windup) or not finite(tuning.active) or not finite(tuning.recovery) then
		return nil, "invalid_state"
	end
	if now < state.startedAt then return nil, "time_reversed" end
	local elapsed = now - state.startedAt + 1e-6
	if state.phase == "idle" then
		if now < (state.cooldownUntil or 0) then return state end
		return { phase = "windup", startedAt = now, hitTargetIds = {} }
	elseif state.phase == "windup" and elapsed >= tuning.windup then
		return { phase = "active", startedAt = state.startedAt, hitTargetIds = state.hitTargetIds }
	elseif state.phase == "active" and elapsed >= tuning.windup + tuning.active then
		return { phase = "recovery", startedAt = state.startedAt, hitTargetIds = state.hitTargetIds }
	elseif state.phase == "recovery" and elapsed >= tuning.windup + tuning.active + tuning.recovery then
		return { phase = "idle", startedAt = now, cooldownUntil = now + (tuning.cooldown or 0), hitTargetIds = {} }
	end
	return state
end

function CombatRules.resolveHit(state, targetId, distance, range, damage, targetHealth)
	if type(state) ~= "table" or state.phase ~= "active" or type(state.hitTargetIds) ~= "table" then return nil, "inactive" end
	if type(targetId) ~= "string" or targetId == "" or not finite(distance) or not finite(range) or not finite(damage) or not finite(targetHealth) then return nil, "malformed" end
	if distance < 0 or range <= 0 or damage <= 0 or targetHealth <= 0 then return nil, "invalid_value" end
	if distance > range then return nil, "out_of_range" end
	if state.hitTargetIds[targetId] then return nil, "duplicate_hit" end
	local hitTargets = table.clone(state.hitTargetIds)
	hitTargets[targetId] = true
	return { remainingHealth = math.max(0, targetHealth - damage), hitTargetIds = hitTargets }
end

return table.freeze(CombatRules)
