local Rules = require("../src/shared/CombatRules")

local tuning = { windup = 0.2, active = 0.15, recovery = 0.35, cooldown = 0.4 }
local state = { phase = "idle", startedAt = 0, cooldownUntil = 0 }
state = assert(Rules.advance(state, 1, tuning))
assert(state.phase == "windup", "attack begins in windup")
state = assert(Rules.advance(state, 1.2, tuning))
assert(state.phase == "active", "attack enters active window")
local hit = assert(Rules.resolveHit(state, "dummy", 5, 6, 20, 50))
assert(hit.remainingHealth == 30, "valid in-range hit applies bounded damage")
local duplicate, duplicateReason = Rules.resolveHit({ phase = "active", hitTargetIds = hit.hitTargetIds }, "dummy", 5, 6, 20, 50)
assert(duplicate == nil and duplicateReason == "duplicate_hit", "one swing cannot hit the same target twice")
local distant, distantReason = Rules.resolveHit(state, "distant", 7, 6, 20, 50)
assert(distant == nil and distantReason == "out_of_range", "hit detection rejects a target beyond the server range")
state = assert(Rules.advance(state, 1.36, tuning))
assert(state.phase == "recovery", "active window closes into recovery")
state = assert(Rules.advance(state, 1.72, tuning))
assert(state.phase == "idle" and state.cooldownUntil == 2.12, "recovery completes and applies cooldown")
print("PASS combat timing, duplicate-hit, range, recovery, and cooldown")
