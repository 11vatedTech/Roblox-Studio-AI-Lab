local server = game:GetService("ServerScriptService"):WaitForChild("MisprintServer")
assert(server:FindFirstChild("CombatRules"), "CombatRules module is missing")
local rules = require(server.CombatRules)
local context = {
	member = true, phase = "phase_one", ownedIds = { girdle_9 = true },
	activeSummons = 0, callCooldownSeconds = 1, lastCallAt = {},
	requestCooldownSeconds = 0.2, lastActionAt = 0,
	min = Vector3.new(-40, 0, -40), max = Vector3.new(40, 30, 40),
}
local valid = { cardId = "girdle_9", position = Vector3.new(0, 4, 0) }
local accepted = rules.validateCall(context, valid, 10)
assert(accepted, "valid call should pass")
local before = context.activeSummons
local rejected, reason = rules.validateCall(context, { cardId = "unknown", position = valid.position }, 10)
assert(not rejected and reason == "unowned_card", "unknown card should be explicitly rejected")
assert(context.activeSummons == before, "rejection must not mutate context")
rejected, reason = rules.validateCall(context, "bad-payload", 10)
assert(not rejected and reason == "malformed", "non-table payload must be rejected")
rejected, reason = rules.validateCall(context, { cardId = "girdle_9", position = valid.position, damage = 999 }, 10)
assert(not rejected and reason == "malformed", "extra client-owned fields must be rejected")
rejected, reason = rules.validateCall(context, { cardId = "girdle_9", position = Vector3.new(math.huge, 4, 0) }, 10)
assert(not rejected and reason == "invalid_position", "non-finite position must be rejected")
rejected, reason = rules.validateCall(context, { cardId = "girdle_9", position = Vector3.new(80, 4, 0) }, 10)
assert(not rejected and reason == "out_of_bounds", "out-of-bounds call must be rejected")
context.member = false
rejected, reason = rules.validateCall(context, valid, 10)
assert(not rejected and reason == "not_member", "non-member call must be rejected")
context.member = true
context.lastCallAt.girdle_9 = 9.5
rejected, reason = rules.validateCall(context, valid, 10)
assert(not rejected and reason == "cooldown", "cooldown call must be rejected")
context.lastCallAt.girdle_9 = nil
context.lastActionAt = 9.9
rejected, reason = rules.validateCall(context, valid, 10)
assert(not rejected and reason == "rate_limited", "over-rate call must be rejected")
context.activeSummons = 2
context.lastActionAt = 0
rejected, reason = rules.validateCall(context, valid, 10)
assert(not rejected and reason == "summon_limit", "third summon should be rejected")
context.activeSummons = 0
context.phase = "reward"
rejected, reason = rules.validateCall(context, valid, 10)
assert(not rejected and reason == "wrong_phase", "reward phase cannot accept calls")
