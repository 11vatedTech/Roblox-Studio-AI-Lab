local Rules = require("../src/shared/CreatureRules")

local tuning = { noticeRange = 30, telegraph = 1, attack = 0.4, recover = 1.2 }
local state = { phase = "idle", startedAt = 0, attackCount = 0 }
state = assert(Rules.step(state, 50, 1, tuning))
assert(state.phase == "idle", "creature ignores players outside its perception radius")
state = assert(Rules.step(state, 20, 2, tuning))
assert(state.phase == "telegraph", "perception starts a readable attack telegraph")
state = assert(Rules.step(state, 20, 3, tuning))
assert(state.phase == "attack" and state.attackCount == 1, "telegraph advances into one server-owned attack")
state = assert(Rules.step(state, 20, 3.4, tuning))
assert(state.phase == "recover", "attack advances through recovery")
state = assert(Rules.step(state, 40, 4.6, tuning))
assert(state.phase == "idle", "creature returns to idle after losing its target")
local invalid, invalidReason = Rules.step({ phase = "erasing", startedAt = 0 }, 1, 1, tuning)
assert(invalid == nil and invalidReason == "unknown_phase", "unknown AI state fails closed")
print("PASS creature perception, telegraph, attack, recovery, and target loss")
