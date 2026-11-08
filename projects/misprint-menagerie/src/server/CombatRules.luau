local CombatRules = {}

local function finite(number)
	return type(number) == "number" and number == number and math.abs(number) < math.huge
end

local function containsOnlyCallKeys(request)
	local count = 0
	for key in pairs(request) do
		if key ~= "cardId" and key ~= "position" then
			return false
		end
		count += 1
	end
	return count == 2
end

function CombatRules.validateCall(context, request, now)
	if type(context) ~= "table" or type(request) ~= "table" or not containsOnlyCallKeys(request) then
		return false, "malformed"
	end
	if not context.member then
		return false, "not_member"
	end
	if type(request.cardId) ~= "string" or not context.ownedIds[request.cardId] then
		return false, "unowned_card"
	end
	if typeof(request.position) ~= "Vector3" or not finite(request.position.X) or not finite(request.position.Y) or not finite(request.position.Z) then
		return false, "invalid_position"
	end
	local position = request.position
	if position.X < context.min.X or position.X > context.max.X
		or position.Y < context.min.Y or position.Y > context.max.Y
		or position.Z < context.min.Z or position.Z > context.max.Z then
		return false, "out_of_bounds"
	end
	if context.phase ~= "phase_one" and context.phase ~= "phase_two" then
		return false, "wrong_phase"
	end
	local lastCallAt = context.lastCallAt[request.cardId]
	if type(lastCallAt) == "number" and now - lastCallAt < context.callCooldownSeconds then
		return false, "cooldown"
	end
	if not finite(now) or now - context.lastActionAt < context.requestCooldownSeconds then
		return false, "rate_limited"
	end
	if context.activeSummons >= (context.maxActiveSummons or 2) then
		return false, "summon_limit"
	end
	return true
end

return table.freeze(CombatRules)
