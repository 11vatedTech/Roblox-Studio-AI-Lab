local EnvironmentRules = {}

local profiles = {
	low = { decorativePartCap = 80, distantRingCount = 0, dynamicLights = false, criticalLandmarks = true },
	medium = { decorativePartCap = 220, distantRingCount = 1, dynamicLights = false, criticalLandmarks = true },
	high = { decorativePartCap = 480, distantRingCount = 3, dynamicLights = true, criticalLandmarks = true },
}

function EnvironmentRules.profile(tier)
	local source = profiles[tier]
	if not source then return nil, "unknown_tier" end
	return table.clone(source)
end

function EnvironmentRules.validateScene(scene)
	if type(scene) ~= "table" or type(scene.landmarks) ~= "table" or type(scene.details) ~= "number" then return false, "malformed" end
	if scene.details < 0 or scene.details ~= math.floor(scene.details) then return false, "invalid_detail_count" end
	for _, required in ipairs({ "spawn", "goal", "hazard" }) do
		if scene.landmarks[required] ~= true then return false, "missing_" .. required end
	end
	return true
end

return table.freeze(EnvironmentRules)
