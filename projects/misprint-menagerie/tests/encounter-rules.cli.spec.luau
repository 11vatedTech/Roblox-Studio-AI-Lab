local rules = require("../src/server/EncounterRules")
local state = rules.new({ 101, 202 })

assert(state.phase == "entry")
assert(not rules.transition(state, "reward"), "entry must not skip encounter phases")
assert(rules.transition(state, "phase_one"))
assert(rules.transition(state, "phase_two"))
assert(not rules.tryGrantReward(state, 101), "rewards require the reward phase")
assert(rules.transition(state, "reward"))
assert(rules.tryGrantReward(state, 101), "eligible participant receives the reward")
assert(not rules.tryGrantReward(state, 101), "a reward can only be granted once")

state.activeSummons[101] = { "morrowbell" }
assert(rules.removePlayer(state, 101))
assert(state.players[101] == nil and state.activeSummons[101] == nil, "disconnect cleans membership and summons")
assert(not rules.removePlayer(state, 303), "unknown participants cannot be removed")
assert(rules.setKnockedOut(state, 202, true))
assert(rules.allKnockedOut(state), "all active participants can be knocked out")
print("PASS: EncounterRules transitions and cleanup")
