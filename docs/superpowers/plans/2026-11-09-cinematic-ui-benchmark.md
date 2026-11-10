# Cinematic UI Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Field Notes cinematic UI as a real client-only Roblox benchmark with ordered cues, immediate skip, reduced-motion timing, and a valid pinned Rojo project.

**Architecture:** Keep `CinematicRules` as a deterministic shared state transition, strengthen its bounded input validation, and drive a single client-owned ScreenGui from that state. Remove the nonexistent server/client folder mappings and map the LocalScript by its exact source file; keep all experience state local to presentation and add no remote or persistence path.

**Tech Stack:** Luau 0.745 CLI and parser, Roblox `ScreenGui`/`GuiButton.Activated`, Rojo 7.7.1, Node.js test runner.

## Global Constraints

- The project is `projects/benchmark-cinematic-ui`; do not change unrelated benchmark implementations.
- Use approved **Field Notes** direction: an upper-left, left-aligned text stack over the 3D scene, restrained teal location labeling, warm objective emphasis, and a subtle dark contrast backing. Keep the center of the viewport clear.
- Use `CinematicRules` for ordered timing and completion; never let skip or reduced motion remove or reorder content.
- Use a restrained 0.18-second text fade between cues in standard mode; reduced motion disables the fade and shortens cue timing without changing information or order.
- The client owns presentation state only. Add no remotes, persistence, third-party assets, purchases, uploads, or publishing.
- Use `GuiButton.Activated` for pointer, touch, and gamepad activation.
- Keep skip and reduced-motion controls visible and operable; reflow at narrow widths instead of shrinking text indefinitely.
- Parser, CLI, and Rojo results are offline evidence only; do not claim Studio runtime, visual, physical-device, or input certification without a live test.
- Preserve the existing dirty worktree. Do not stage or commit unrelated user changes.

---

### Task 1: Bound and test cinematic sequence transitions

**Files:**
- Modify: `projects/benchmark-cinematic-ui/src/shared/CinematicRules.luau`
- Modify: `projects/benchmark-cinematic-ui/tests/cinematic-rules.cli.spec.luau`

**Interfaces:**
- Consumes: `CinematicRules.advance(state, cues, now, skipRequested, reducedMotion)`.
- Produces: the same return contract: next state or `nil, errorCode`; a complete state has `index == #cues + 1`, `complete == true`, and the selected reduced-motion flag.
- Each cue has a unique non-empty `id` and finite `duration` in `[0, 30]` seconds; retain the existing maximum of 16 cues.
- State index must be an integer from 1 through `#cues + 1`; `startedAt` and `now` must be finite, nonnegative timestamps, and `now >= startedAt`.

- [x] **Step 1: Write failing CLI specs for malformed cue and state bounds**

Add these assertions to `cinematic-rules.cli.spec.luau`, after the existing malformed-duration assertion:

```luau
local function rejected(state, testCues, now)
	local result = Rules.advance(state, testCues, now, false, false)
	assert(result == nil, "malformed timing input is rejected")
end

rejected({ index = 1, startedAt = 0 }, { { id = "long", duration = 30.01 } }, 1)
rejected({ index = 1, startedAt = 0 }, { { id = "infinite", duration = math.huge } }, 1)
rejected({ index = 1, startedAt = 0 }, { { id = "same", duration = 1 }, { id = "same", duration = 1 } }, 1)
rejected({ index = 1.5, startedAt = 0 }, cues, 1)
rejected({ index = 1, startedAt = -1 }, cues, 1)
rejected({ index = 1, startedAt = 0 }, cues, math.huge)
```

- [x] **Step 2: Run the focused Luau spec and confirm the new cases fail**

Run: `& .\.tools\luau-0.745\luau.exe projects\benchmark-cinematic-ui\tests\cinematic-rules.cli.spec.luau`

Expected: FAIL because at least one invalid duration, duplicate cue ID, fractional index, or infinite timestamp is currently accepted.

- [x] **Step 3: Implement finite, bounded cue and state validation**

Add a local finite-number predicate and the exact checks below in `CinematicRules.luau`:

```luau
local MAX_CUE_DURATION = 30

local function finiteNumber(value)
	return type(value) == "number" and value == value and value > -math.huge and value < math.huge
end
```

Update cue validation to reject duplicate IDs and durations outside `[0, MAX_CUE_DURATION]`; update `advance` to reject non-finite times, negative timestamps, and non-integer indexes before arithmetic. Do not change successful progression order.

- [x] **Step 4: Add reduced-motion order and completed-state stability specs**

Append these assertions:

```luau
local reduced = { index = 1, startedAt = 0 }
reduced = assert(Rules.advance(reduced, cues, 0.05, false, true))
assert(reduced.index == 2 and not reduced.complete, "reduced motion advances only the first cue")
reduced = assert(Rules.advance(reduced, cues, 0.10, false, true))
assert(reduced.index == 3 and reduced.complete, "reduced motion preserves the final cue and its order")
local settled = assert(Rules.advance(reduced, cues, 0.11, false, true))
assert(settled.index == 3 and settled.complete, "completed state remains settled")
```

- [x] **Step 5: Run the focused spec and verify it passes**

Run: `& .\.tools\luau-0.745\luau.exe projects\benchmark-cinematic-ui\tests\cinematic-rules.cli.spec.luau`

Expected: exit code 0 and the existing `PASS cinematic timing, cue order, skip, and reduced-motion path` output.

### Task 2: Implement the Field Notes client and valid Rojo mapping

**Files:**
- Modify: `projects/benchmark-cinematic-ui/default.project.json`
- Create: `projects/benchmark-cinematic-ui/src/client/CinematicIntro.client.luau`
- Modify: `projects/benchmark-cinematic-ui/benchmark.json`

**Interfaces:**
- Consumes: the shared `BenchmarkShared.CinematicRules` module and its `advance` transition.
- Produces: one `StarterPlayerScripts` LocalScript that presents three cues (`title`, `location`, `objective`), a persistent Skip button, a Reduced Motion toggle, and a completed state where the objective text remains visible.

- [x] **Step 1: Remove invalid directory mappings and add the exact LocalScript mapping**

Set the project tree to:

```json
{
  "name": "Benchmark — Cinematic and UI",
  "tree": {
    "$className": "DataModel",
    "ReplicatedStorage": {
      "BenchmarkShared": {
        "$path": "src/shared"
      }
    },
    "StarterPlayer": {
      "StarterPlayerScripts": {
        "CinematicIntro": {
          "$path": "src/client/CinematicIntro.client.luau"
        }
      }
    }
  }
}
```

- [x] **Step 2: Create the client sequence using shared timing rules**

Create `CinematicIntro.client.luau` with an ordered cue table:

```luau
local cues = {
	{ id = "title", duration = 1.2, heading = "THE QUIET BETWEEN", detail = "" },
	{ id = "location", duration = 1.0, heading = "NORTH GLASS MARSH", detail = "A PLACE REMEMBERS" },
	{ id = "objective", duration = 1.6, heading = "YOUR OBJECTIVE", detail = "Find the signal before dusk." },
}
```

Build a single `ScreenGui` under `Players.LocalPlayer.PlayerGui`. Use a left-aligned panel anchored near the upper-left with teal detail text, warm objective accent, dark translucent background, wrapped `TextLabel`s, and bounded size/position constraints. Do not cover the center of the viewport.

- [x] **Step 3: Add shared-rule progression and visible completion**

Initialize state as `{ index = 1, startedAt = os.clock() }`. On `RunService.Heartbeat`, call `Rules.advance(state, cues, os.clock(), false, reducedMotion)` while incomplete. If it returns `nil`, raise an explicit error with the returned code. Render the current cue using `state.index`; when `state.complete` is true, continue rendering cue 3 so the objective stays visible. Guard repeat updates after completion.
Use `TweenService` for a 0.18-second `Quad`/`Out` text fade on cue changes when reduced motion is off. Cancel any in-flight cue fades before starting a new cue; set text visible immediately when reduced motion is on or the user skips.

- [x] **Step 4: Add persistent accessible controls**

Create visible `TextButton`s named `Skip` and `ReducedMotion`, both at least 44 by 44 offset pixels. Connect both through `Activated`. Skip calls `Rules.advance(state, cues, os.clock(), true, reducedMotion)`, errors on rejection, sets the returned state, and renders the objective immediately. The toggle flips the local boolean, updates its visible label, and passes the new value to future rule transitions without changing the cue index. Keep both controls visible through completion and destroy the ScreenGui when the script is destroyed.

- [x] **Step 5: Update benchmark documentation to reflect the implemented source**

In `benchmark.json`, retain the existing scenario and limitations, update the evidence path to `src/client/CinematicIntro.client.luau`, and say the interactive client implementation is authored but Studio visual/input validation remains pending. Do not mark the benchmark passed or Studio-tested.

- [x] **Step 6: Run parser, CLI spec, and the target Rojo build**

Run:

```powershell
& .\.tools\luau-0.745\luau-compile.exe projects\benchmark-cinematic-ui\src\shared\CinematicRules.luau
& .\.tools\luau-0.745\luau-compile.exe projects\benchmark-cinematic-ui\src\client\CinematicIntro.client.luau
& .\.tools\luau-0.745\luau.exe projects\benchmark-cinematic-ui\tests\cinematic-rules.cli.spec.luau
& .\.tools\rojo-7.7.1\rojo.exe build projects\benchmark-cinematic-ui\default.project.json --output $env:TEMP\benchmark-cinematic-ui.rbxlx
```

Expected: both Luau files parse, the CLI spec passes, and Rojo reports a successful build. Inspect the generated place tree to verify `ReplicatedStorage.BenchmarkShared.CinematicRules` and `StarterPlayer.StarterPlayerScripts.CinematicIntro` exist.

### Task 3: Verify regression behavior and maintain honest status

**Files:**
- Modify: `projects/benchmark-cinematic-ui/tests/cinematic-rules.cli.spec.luau`
- No capability ledger promotion unless new evidence meets its existing criteria.

**Interfaces:**
- Consumes: the shared transition contract and client mapping produced by Tasks 1–2.
- Produces: repeatable offline verification and explicit separation from unavailable Studio runtime evidence.

- [x] **Step 1: Run the full Roblox-free Luau CLI spec runner**

Run: `pwsh -NoProfile -File scripts/run-luau-specs.ps1`

Expected: every discovered `*.cli.spec.luau` passes; the output count equals the number of started specs.

- [x] **Step 2: Run Node tests for project build integration**

Run: `node --test tests/rojo-workflows.test.js tests/luau-pure-runner.test.js`

Expected: both targeted suites pass and the Luau runner counts all CLI specs instead of expecting the previous fixed count.

- [x] **Step 3: Run the repository offline gate and record limitations**

Run: `pwsh -NoProfile -File scripts/test-all.ps1`

Expected for this slice: Node tests and Luau parsing pass. Rojo builds pass for projects reached by the build runner; report any remaining failure precisely and do not claim all-project success if another project's mapping or source is still invalid.

Observed: 96/96 Node tests passed and 67 Luau files parsed. Rojo built the base, cinematic UI, and combat/animation projects, then stopped at the separate `benchmark-creature-ai` manifest because `src/world` is missing. This unrelated project remains unchanged.

- [x] **Step 4: Recheck project and Git state**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only the planned client benchmark/spec changes plus pre-existing user work are present. Do not commit unrelated changes. Studio visual, touch/controller, runtime, and device acceptance remain explicitly unverified until a connected Studio session is available.
