local hud = require("../src/shared/HudState")
local state = hud.initial()
assert(state.screen == "index")

state = hud.reduce(state, { kind = "encounter_state", phase = "phase_one", bossHealth = 100 })
assert(state.screen == "encounter" and state.phase == "phase_one")
local ownedBefore = state.ownedCardIds
state = hud.reduce(state, { kind = "call_rejected", reason = "summon_limit" })
assert(state.message == "summon_limit", "rejected requests are visible")
assert(state.ownedCardIds == ownedBefore, "rejection events cannot grant a card")

local unchanged = hud.reduce(state, { kind = "unknown_payload" })
assert(unchanged == state, "unknown events preserve state identity")
local snapshot = hud.reduce(state, { kind = "snapshot", phase = "phase_two", bossHealth = "invalid" })
assert(snapshot.phase == "phase_two" and snapshot.bossHealth == 0, "invalid snapshot numbers normalize to a safe value")
print("PASS: HudState reducer invariants")
