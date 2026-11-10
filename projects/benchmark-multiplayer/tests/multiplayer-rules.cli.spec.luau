local Rules = require("../src/shared/MultiplayerRules")

local state = { activations = {} }
state = assert(Rules.activate(state, 1001, "north", true, 10, 8))
assert(not state.completed, "one player cannot complete both sides of the cooperative gate")
local duplicate, duplicateReason = Rules.activate(state, 1001, "south", true, 11, 8)
assert(duplicate == nil and duplicateReason == "distinct_players_required", "same-player double activation is rejected")
local far, farReason = Rules.activate(state, 1002, "south", false, 11, 8)
assert(far == nil and farReason == "out_of_range", "remote cooperative activation is rejected")
state = assert(Rules.activate(state, 1002, "south", true, 11, 8))
assert(state.completed, "distinct nearby players complete the shared gate")
local late = assert(Rules.activate({ activations = { north = { userId = 1001, at = 1 } } }, 1002, "south", true, 20, 8))
assert(not late.completed, "stale activation does not complete a later round")
print("PASS distinct-player cooperation, range validation, and stale reset window")
