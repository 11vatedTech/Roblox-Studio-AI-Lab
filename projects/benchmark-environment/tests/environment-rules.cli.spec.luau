local Rules = require("../src/shared/EnvironmentRules")

for _, tier in ipairs({ "low", "medium", "high" }) do
	local profile = assert(Rules.profile(tier))
	assert(profile.criticalLandmarks, "every quality tier preserves critical gameplay landmarks")
	assert(profile.decorativePartCap >= 0, "every tier has a bounded decoration budget")
end
assert(Rules.profile("low").decorativePartCap < Rules.profile("high").decorativePartCap, "quality tiers change real detail budgets")
assert(Rules.validateScene({ landmarks = { spawn = true, goal = true, hazard = true }, details = 40 }), "complete scene satisfies readability contract")
local broken, reason = Rules.validateScene({ landmarks = { spawn = true, goal = true }, details = 40 })
assert(not broken and reason == "missing_hazard", "a tier cannot omit a gameplay hazard marker")
print("PASS environment tiers, bounded detail, and critical-landmark preservation")
