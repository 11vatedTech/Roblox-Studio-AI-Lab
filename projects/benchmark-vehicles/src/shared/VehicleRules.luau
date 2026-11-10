local VehicleRules = {}

local function finite(value)
	return type(value) == "number" and value == value and math.abs(value) < math.huge
end

function VehicleRules.validateInput(input, lastAcceptedAt, now, minimumInterval)
	if type(input) ~= "table" or not finite(input.throttle) or not finite(input.steer) or not finite(lastAcceptedAt) or not finite(now) or not finite(minimumInterval) then
		return nil, "malformed"
	end
	local count = 0
	for key in pairs(input) do
		if key ~= "throttle" and key ~= "steer" then return nil, "unknown_field" end
		count += 1
	end
	if count ~= 2 or input.throttle < -1 or input.throttle > 1 or input.steer < -1 or input.steer > 1 then return nil, "out_of_bounds" end
	if now < lastAcceptedAt or now - lastAcceptedAt < minimumInterval then return nil, "rate_limited" end
	return { throttle = input.throttle, steer = input.steer, acceptedAt = now }
end

function VehicleRules.shouldRecover(distanceFromRoute, stuckSeconds, maximumDistance, recoverySeconds)
	if not finite(distanceFromRoute) or not finite(stuckSeconds) or not finite(maximumDistance) or not finite(recoverySeconds) then return false, "malformed" end
	if distanceFromRoute < 0 or stuckSeconds < 0 then return false, "invalid_value" end
	return distanceFromRoute > maximumDistance or stuckSeconds >= recoverySeconds
end

return table.freeze(VehicleRules)
