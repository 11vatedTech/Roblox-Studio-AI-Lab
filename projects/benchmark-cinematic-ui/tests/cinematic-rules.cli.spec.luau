local Rules = require("../src/shared/CinematicRules")

local cues = { { id = "arrival", duration = 2 }, { id = "reveal", duration = 3 } }
local state = assert(Rules.advance({ index = 1, startedAt = 0 }, cues, 1, false, false))
assert(state.index == 1 and not state.complete, "cinematic holds a cue until its timing boundary")
state = assert(Rules.advance(state, cues, 2, false, false))
assert(state.index == 2 and not state.complete, "cinematic advances through authored cues")
state = assert(Rules.advance(state, cues, 2.05, false, true))
assert(state.complete, "reduced motion shortens presentation while preserving the cue order")
local skipped = assert(Rules.advance({ index = 1, startedAt = 0 }, cues, 0.1, true, false))
assert(skipped.complete and skipped.index == #cues + 1, "player can skip the sequence")
local malformed = Rules.advance({ index = 1, startedAt = 0 }, { { id = "bad", duration = -1 } }, 1, false, false)
assert(malformed == nil, "invalid cue timing is rejected")

local function rejected(stateToCheck, testCues, now)
	local result = Rules.advance(stateToCheck, testCues, now, false, false)
	assert(result == nil, "malformed timing input is rejected")
end

rejected({ index = 1, startedAt = 0 }, { { id = "long", duration = 30.01 } }, 1)
rejected({ index = 1, startedAt = 0 }, { { id = "infinite", duration = math.huge } }, 1)
rejected({ index = 1, startedAt = 0 }, { { id = "nan", duration = 0 / 0 } }, 1)
rejected({ index = 1, startedAt = 0 }, { { id = "same", duration = 1 }, { id = "same", duration = 1 } }, 1)
rejected({ index = 1, startedAt = 0 }, { { id = "   ", duration = 1 } }, 1)
rejected({ index = 1.5, startedAt = 0 }, cues, 1)
rejected({ index = 1, startedAt = -1 }, cues, 1)
rejected({ index = 1, startedAt = 0 }, cues, math.huge)
rejected({ index = 1, startedAt = 0 }, cues, 1 / 0)

local reduced = { index = 1, startedAt = 0 }
reduced = assert(Rules.advance(reduced, cues, 0.05, false, true))
assert(reduced.index == 2 and not reduced.complete, "reduced motion advances only the first cue")
reduced = assert(Rules.advance(reduced, cues, 0.10, false, true))
assert(reduced.index == 3 and reduced.complete, "reduced motion preserves the final cue and its order")
local settled = assert(Rules.advance(reduced, cues, 0.11, false, true))
assert(settled.index == 3 and settled.complete, "completed state remains settled")
print("PASS cinematic timing, cue order, skip, and reduced-motion path")
