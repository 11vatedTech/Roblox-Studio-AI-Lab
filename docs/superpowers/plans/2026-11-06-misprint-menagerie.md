# Misprint Menagerie Implementation Plan

> **For agentic workers:** Use `executing-plans` to implement this plan task by task. Keep work inline; do not dispatch subagents.

**Goal:** Build a complete, unpublished Roblox vertical slice for Misprint Menagerie: a mobile-readable, server-authoritative creature summoner with a solo/co-op boss hunt and six authored summon cards.

**Architecture:** Create an independent Rojo project under `projects/misprint-menagerie/`. Keep card and encounter rules explicit, isolate server-owned session/collection/combat state from client presentation, and use Roblox Studio for behavior checks that the repository's syntax parser and Rojo build cannot prove.

**Tech Stack:** Luau, Roblox Studio, Rojo 7.7.1, native Roblox Parts/WedgeParts/Cylinders for original low-poly art, PowerShell build scripts, and the official Roblox Studio MCP integration for local test-place inspection.

## Global Constraints

- Follow `AGENTS.md`, `docs/superpowers/specs/2026-11-06-misprint-menagerie-design.md`, and `docs/workflows/studio-connect.md`.
- Do not edit Signal Garden, the base template's gameplay, generated place files, or existing Studio content.
- Build the new experience only in `projects/misprint-menagerie/`; use the base template's Rojo service layout and the pinned Rojo 7.7.1.
- The first slice has one to three players, six authored cards, a three-card loadout, at most two active summons per player, one arena, and one two-phase boss.
- Unlocks are deterministic and session-only. Add no DataStore writes, monetization, cross-server matchmaking, purchases, uploads, Open Cloud calls, or publishing.
- Treat all client requests as untrusted. The server owns card access, phase, summon state, damage, boss results, and reward eligibility.
- Use only locally authored/native geometry. Add no Creator Store, paid, or unlicensed assets.
- Before the first live Studio operation, call `list_roblox_studios`, confirm the exact instance and open place, and use an unpublished local build. Do not save or publish it.
- Run focused Luau assertions through the official Studio `execute_luau` tool in the Server or Client DataModel as appropriate. Run `scripts/test-all.ps1` for offline tests, syntax parsing, and Rojo builds; report that syntax parsing is not engine type checking.
- Do not create a Git commit. The workspace has no existing HEAD commit, and establishing repository history was not requested.

## File Map

- `projects/misprint-menagerie/default.project.json` maps shared, server, and client source into Roblox services.
- `projects/misprint-menagerie/README.md` documents build, controls, session-only progression, and the current playable boundary.
- `projects/misprint-menagerie/src/shared/` contains configuration, card data, remote protocol definitions, and pure client-visible state.
- `projects/misprint-menagerie/src/server/` contains pure rules plus encounter, collection, combat, summon, boss, and world services. `Bootstrap.server.luau` wires them together.
- `projects/misprint-menagerie/src/client/` contains the Index/combat HUD, touch-first input, telegraphs, and presentation only.
- `projects/misprint-menagerie/tests/` contains assert-based Luau test programs. These are not mapped by `default.project.json`; execute their contents against the isolated Studio Server DataModel with `execute_luau`.
- `assets/asset-ledger.json` records that this slice uses original source-authored geometry and has no external asset inputs.
- `evidence/studio/` stores only actual local Studio test evidence with instance/place/build identity and truthful results.

## Test Workflow

For each rules module, create the assert-based test file first. Build the local place, call `list_roblox_studios`, open that generated place in Studio, start local Play, and execute the test file's Luau body with `execute_luau` targeting `Server` for server modules or `Client` for `HudState`. Confirm the expected assertion fails before writing the implementation, then confirm it passes after implementation. Keep each test block small and deterministic so execution on Studio's main thread finishes without yielding.

The repository-wide command is `.\scripts\test-all.ps1`. It runs Node tests, parses Luau syntax, and builds all discovered projects. It does not replace Studio behavior checks.

Use Roblox's official [Studio testing modes](https://create.roblox.com/docs/studio/testing-modes) for solo and Server & Clients playtests. Do not use Open Cloud Luau execution for this project; all testing remains on the local unpublished build.

Use Roblox's [Input Action System](https://create.roblox.com/docs/input/input-action-system) for cross-device gameplay bindings. Set the place-level `Workspace.PlayerScriptsUseInputActionSystem` rollout to Enabled in the Rojo project manifest and verify the generated place. Roblox documents the property as `Enum.RolloutState`, and Rojo's project format supports explicit enum values. The current official Roblox docs describe `ContextActionService:BindAction()` as not recommended for new work and planned for deprecation, so do not base this project on that API.

---

### Task 1: Scaffold the isolated Rojo project

**Files:**
- Create: `projects/misprint-menagerie/default.project.json`
- Create: `projects/misprint-menagerie/README.md`
- Create directories: `projects/misprint-menagerie/src/shared/`, `src/server/`, `src/client/`, and `tests/`

**Interfaces:**
- Produces a buildable DataModel whose containers are `ReplicatedStorage.MisprintShared`, `ServerScriptService.MisprintServer`, and `StarterPlayer.StarterPlayerScripts.MisprintClient`.
- Does not map `tests/` into the production Rojo tree.

- [x] **Step 1: Write the Rojo manifest and README.**

Use this service mapping in `default.project.json`:

```json
{
  "name": "Misprint Menagerie",
  "tree": {
    "$className": "DataModel",
    "ReplicatedStorage": {
      "MisprintShared": { "$path": "src/shared" }
    },
    "ServerScriptService": {
      "MisprintServer": { "$path": "src/server" }
    },
    "Workspace": {
      "$properties": {
        "PlayerScriptsUseInputActionSystem": { "Enum": 2 }
      }
    },
    "StarterPlayer": {
      "StarterPlayerScripts": {
        "MisprintClient": { "$path": "src/client" }
      }
    }
  }
}
```

In the README, state that the title is provisional, the experience is an unpublished vertical slice, unlocks reset on leaving, and the build command is `..\..\scripts\build-all.ps1` from the project directory.

- [x] **Step 2: Build the new project.**

Run: `..\..\scripts\build-all.ps1` from `projects/misprint-menagerie/`.

Expected: Rojo builds the base, Signal Garden, and Misprint Menagerie; `evidence/build-report.json` contains a successful `projects\misprint-menagerie` entry. The generated `.rbxlx` includes `PlayerScriptsUseInputActionSystem` as `Enum.RolloutState.Enabled`.

- [x] **Step 3: Check workspace state.**

Run: `git status --short`.

Expected: only the new project files are added by this task; all pre-existing untracked repository files remain untouched.

### Task 2: Add the authored six-card catalog

**Files:**
- Create: `projects/misprint-menagerie/src/shared/GameConfig.luau`
- Create: `projects/misprint-menagerie/src/shared/CardCatalog.luau`
- Create: `projects/misprint-menagerie/src/shared/RemoteProtocol.luau`
- Create: `projects/misprint-menagerie/tests/card-catalog.spec.luau`

**Interfaces:**
- `CardCatalog.getAll(): {CardDefinition}` returns a stable copy of all six definitions.
- `CardCatalog.get(cardId: string): CardDefinition?` returns one definition or nil.
- `CardCatalog.getStarterIds(): {string}` returns the three initial card IDs.
- Each definition has `id`, `displayName`, `style`, `role`, `cooldownSeconds`, `arrivalEffect`, `combatBehavior`, and either `starter = true` or a deterministic `unlockChallengeId`.
- `RemoteProtocol` defines stable remote names and request/response shapes; the client sends only call/command intent, while server messages contain encounter/collection snapshots or explicit rejections.

- [ ] **Step 1: Write the catalog assertion program before the module.**

```lua
local shared = game:GetService("ReplicatedStorage"):FindFirstChild("MisprintShared")
assert(shared and shared:FindFirstChild("CardCatalog"), "CardCatalog module is missing")
local catalog = require(shared.CardCatalog)
local cards = catalog.getAll()
assert(#cards == 6, "expected six authored cards")
assert(#catalog.getStarterIds() == 3, "expected three starter cards")
local seen = {}
for _, card in ipairs(cards) do
	assert(type(card.id) == "string" and card.id ~= "", "card id must be a non-empty string")
	assert(not seen[card.id], "card ids must be unique")
	seen[card.id] = true
	assert(type(card.style) == "string" and type(card.role) == "string", "card needs style and role")
	assert(type(card.arrivalEffect) == "string" and type(card.combatBehavior) == "string", "card needs authored mechanics")
end
assert(catalog.get("morrowbell").style == "ghost", "Morrowbell must be the ghost card")
assert(catalog.get("missing-card") == nil, "unknown cards must not resolve")
```

- [ ] **Step 2: Run the assertions and confirm the expected failure.**

After opening the scaffold build in an isolated Studio place, call `list_roblox_studios`, start Play, then pass the code above to `execute_luau` with `datamodel_type = "Server"` and the verified `studio_id`.

Expected: the assertion reports that `CardCatalog` is missing. Do not proceed if the failure is caused by a different Studio instance or DataModel.

- [ ] **Step 3: Implement `GameConfig` and `CardCatalog`.**

Define the six fixed IDs `girdle_9`, `nib_and_nuzzle`, `morrowbell`, `foldwyn_pagewing`, `buttongrin`, and `sableline`. Set Girdle-9, Nib & Nuzzle, and Morrowbell as starters. Declare the remaining unlock pairs as `foldwyn_pagewing → fold_the_blank`, `buttongrin → hold_the_line`, and `sableline → trace_the_echo`. The server challenge facts are: use starter cover to cross an erased lane; defeat the boss without a player knockout; and combine Morrowbell's mark with Girdle-9's cover before defeating the boss. Freeze internal definitions and return copies from collection functions so callers cannot mutate the authoritative catalog.

- [ ] **Step 4: Rebuild and rerun the catalog assertions.**

Run: `..\..\scripts\build-all.ps1`, reopen the generated local place, start Play, and rerun the same `execute_luau` assertions.

Expected: every assertion passes and the server output contains no module errors.

### Task 3: Implement and test encounter state rules

**Files:**
- Create: `projects/misprint-menagerie/src/server/EncounterRules.luau`
- Create: `projects/misprint-menagerie/tests/encounter-rules.spec.luau`

**Interfaces:**
- `EncounterRules.new(playerUserIds)` creates an `entry` state with enrolled players and empty summon/reward sets.
- The state stores `players[userId]`, `activeSummons[userId]`, `knockedOut[userId]`, and `rewarded[userId]` maps.
- `EncounterRules.transition(state, nextPhase)` permits only `entry → phase_one → phase_two → reward → closed` and returns `false` for any other edge.
- `EncounterRules.setKnockedOut(state, userId, isKnockedOut)` tracks enrolled participants; `allKnockedOut(state)` returns true only when at least one participant is enrolled and all enrolled participants are down.
- `EncounterRules.removePlayer(state, userId)` removes that player's active summons and membership.
- `EncounterRules.tryGrantReward(state, userId)` returns true once per enrolled eligible player after phase `reward` and false for duplicate, absent, or premature requests.

- [ ] **Step 1: Write tests for valid/invalid transitions, knockout, disconnect, and reward idempotency.**

Create `encounter-rules.spec.luau` with these assertions:

```lua
local server = game:GetService("ServerScriptService"):WaitForChild("MisprintServer")
assert(server:FindFirstChild("EncounterRules"), "EncounterRules module is missing")
local rules = require(server.EncounterRules)
local state = rules.new({ 101, 202 })
assert(state.phase == "entry")
assert(not rules.transition(state, "reward"), "entry cannot jump directly to reward")
assert(not rules.transition(state, "unknown_phase"), "unknown phase must be rejected")
assert(not rules.tryGrantReward(state, 101), "entry phase cannot award cards")
assert(rules.transition(state, "phase_one"))
assert(not rules.transition(state, "reward"), "entry must not skip boss phases")
assert(rules.transition(state, "phase_two"))
assert(rules.transition(state, "reward"))
assert(rules.tryGrantReward(state, 101), "eligible player should receive first reward")
assert(not rules.tryGrantReward(state, 101), "reward must be idempotent")
state.activeSummons[101] = { "morrowbell" }
rules.removePlayer(state, 101)
assert(state.players[101] == nil and state.activeSummons[101] == nil, "disconnect must clean membership and summons")
assert(not rules.removePlayer(state, 303), "unknown player removal must be rejected")
rules.setKnockedOut(state, 202, true)
assert(rules.allKnockedOut(state), "all active participants are knocked out")
```

- [ ] **Step 2: Run the test program through `execute_luau` and confirm missing-module failure.**

Use the isolated Server DataModel and verified `studio_id`. Expected: a clear missing `EncounterRules` assertion fails.

- [ ] **Step 3: Implement the pure state transitions.**

Keep this module independent of `Players`, `Workspace`, remotes, and DataStores. Reject unknown phases and user IDs without mutating valid state.

- [ ] **Step 4: Rerun the same tests.**

Expected: all state assertions pass, including duplicate reward rejection and disconnect cleanup.

### Task 4: Add session and collection services

**Files:**
- Create: `projects/misprint-menagerie/src/server/CollectionRules.luau`
- Create: `projects/misprint-menagerie/src/server/CollectionService.luau`
- Create: `projects/misprint-menagerie/src/server/EncounterService.luau`
- Create: `projects/misprint-menagerie/src/server/Bootstrap.server.luau`
- Create: `projects/misprint-menagerie/tests/collection-rules.spec.luau`

**Interfaces:**
- `CollectionRules.newSession(userId)` initializes exactly the three starter IDs and no persistent profile.
- `CollectionRules.validateLoadout(session, cardIds)` requires exactly three unique, owned catalog IDs.
- `CollectionRules.hasCard(session, cardId)` is the server-owned membership check used by combat validation.
- `CollectionRules.unlock(session, cardId, challengeId)` grants only the card/challenge pairing declared by the catalog and reports whether it was newly granted.
- Only server-owned encounter facts can trigger unlock evaluation. No remote accepts a client-supplied challenge completion or unlock ID.
- `EncounterService` admits at most three same-server players who opt into the portal before the hunt begins; it rejects joins after the encounter starts.
- `Bootstrap.server.luau` creates/checks named remotes and starts services once.

- [ ] **Step 1: Write collection assertions.**

Create `collection-rules.spec.luau` with these assertions:

```lua
local server = game:GetService("ServerScriptService"):WaitForChild("MisprintServer")
assert(server:FindFirstChild("CollectionRules"), "CollectionRules module is missing")
local rules = require(server.CollectionRules)
local session = rules.newSession(101)
assert(#session.ownedIds == 3, "fresh session starts with three cards")
assert(rules.validateLoadout(session, { "girdle_9", "nib_and_nuzzle", "morrowbell" }))
assert(not rules.validateLoadout(session, { "girdle_9", "morrowbell" }), "loadout must have exactly three cards")
assert(not rules.validateLoadout(session, { "girdle_9", "girdle_9", "morrowbell" }), "duplicate cards are invalid")
assert(not rules.validateLoadout(session, { "girdle_9", "nib_and_nuzzle", "foldwyn_pagewing" }), "unowned card is invalid")
assert(not rules.unlock(session, "foldwyn_pagewing", "wrong_challenge"), "wrong challenge cannot unlock")
assert(rules.unlock(session, "foldwyn_pagewing", "fold_the_blank"), "declared challenge unlocks card")
assert(not rules.unlock(session, "foldwyn_pagewing", "fold_the_blank"), "duplicate unlock is rejected")
```

- [ ] **Step 2: Run tests and verify the expected missing-module failure.**

Use `execute_luau` in Server mode against the isolated local place.

- [ ] **Step 3: Implement pure `CollectionRules` and rerun assertions.**

Expected: all valid and invalid cases pass; no DataStore API is called.

- [ ] **Step 4: Add server session and encounter services.**

Track session membership and collection per `UserId`; start one hunt per Roblox server; remove disconnected players and their summons; return an explicit rejection to late joiners; clear all encounter state when no participants remain.

- [ ] **Step 5: Add bootstrap and remote lifecycle.**

Create only named remotes with expected classes. If an instance exists with the wrong class, fail explicitly. Initialize existing players as well as `PlayerAdded` arrivals, and clean per-player state on `PlayerRemoving`.

- [ ] **Step 6: Rebuild and smoke the server lifecycle.**

Run: `..\..\scripts\build-all.ps1`; start a local server and verify one player can enter, a second can opt in before start, a fourth is rejected, and a late join is rejected.

Expected: no duplicate event connections, no late join changes to encounter membership, and clean teardown when everyone leaves.

### Task 5: Build secure summon, combat, and boss rules

**Files:**
- Create: `projects/misprint-menagerie/src/server/CombatRules.luau`
- Create: `projects/misprint-menagerie/src/server/SummonService.luau`
- Create: `projects/misprint-menagerie/src/server/CombatService.luau`
- Create: `projects/misprint-menagerie/src/server/BossService.luau`
- Create: `projects/misprint-menagerie/tests/combat-rules.spec.luau`

**Interfaces:**
- `CombatRules.validateCall(context, request, now)` returns `(true, nil)` or `(false, reason)` without mutating context.
- Stable rejection reasons are `malformed`, `not_member`, `unowned_card`, `invalid_position`, `out_of_bounds`, `wrong_phase`, `cooldown`, `rate_limited`, and `summon_limit`.
- A valid request contains only `cardId` and a finite target `Vector3`; server context contains player membership, owned IDs, safe arena bounds, active summon count, per-card cooldown duration and timestamps, current phase, and last-action timestamp/cooldown.
- `SummonService` creates and removes server-owned summons and enforces two active summons per player.
- `CombatService` owns call/command remotes, damage, range checks, request throttling, and structured rejection/state messages.
- `BossService` owns the two attack phases, safe-zone changes, telegraphs, health, defeat, and reward transition.
- The summon request and response names/shapes come from `ReplicatedStorage.MisprintShared.RemoteProtocol`; rejection reasons are stable strings for UI and tests.

- [ ] **Step 1: Write rejection and acceptance assertions.**

Create `combat-rules.spec.luau` with a valid context and these assertions:

```lua
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
```

- [ ] **Step 2: Run the tests and confirm missing-module failure.**

Use `execute_luau` against the Server DataModel. Expected: `CombatRules` is missing.

- [ ] **Step 3: Implement pure call validation and rerun.**

Keep Roblox Instances out of `CombatRules`; pass already checked facts in `context` so the rules are deterministic and directly assertable.

- [ ] **Step 4: Implement server call and command handlers.**

Validate remote types, exact keys, card ownership, server-sanity-checked character location, arena bounds/range, phase, active cap, cooldown, and request rate before changing state. Do not accept client damage, card unlocks, boss health, or reward claims.

- [ ] **Step 5: Implement boss phases and deterministic counters.**

Implement two readable server-authored attacks: one marked-zone erasure and one second-phase arena reshaping. Ensure cover, phase, fold, decoy, or weak-point card mechanics provide more than one valid answer to required attacks.

- [ ] **Step 6: Rerun assertions and verify a controlled Server playtest.**

Expected: valid calls create one server-owned summon; rejected calls create none and return a reason; damage and phase transitions are server-authored; rewards only become eligible after boss defeat.

### Task 6: Create The Index, arena, and authored summon silhouettes

**Files:**
- Create: `projects/misprint-menagerie/src/server/WorldBuilder.luau`
- Create: `projects/misprint-menagerie/src/server/CreatureBuilder.luau`
- Modify: `assets/asset-ledger.json`

**Interfaces:**
- `WorldBuilder.build(config)` creates one compact Index hub, one bounded boss arena, portal and summon regions, safe spawn locations, and clearly marked attack surfaces under named folders.
- `CreatureBuilder.build(cardId, parent)` returns the matching server-owned Model with a stable pivot/root and unique silhouette.
- Visuals use authored native Roblox geometry only; no external meshes, textures, sounds, purchases, or uploads.

- [ ] **Step 1: Define a visual instance budget and scene layout.**

Use the approved print-archive direction: cut-paper layers, ink borders, a common summon glyph, readable floor shapes, and contrasting native materials. Start with caps of 16 BaseParts per summon, 32 for the boss, and 180 for the Index and arena combined. Record actual counts in the asset ledger and profile the complete scene on a representative low-end device before treating these as final budgets.

- [ ] **Step 2: Build the Index and arena in bounded chunks.**

Use anchored native Parts/WedgeParts/Cylinders and grouped Models. If using `execute_luau` to generate a large scene, split creation into batches and yield between batches as required by the Studio tool guidance.

- [ ] **Step 3: Build six silhouettes with distinct forms.**

Give Girdle-9 an angular shield/mech frame; Nib & Nuzzle two small linked forms; Morrowbell a translucent hovering silhouette; Foldwyn a layered page-wing form; Buttongrin a soft rounded guardian; and Sableline a narrow ink-puppet silhouette. Use materials, lighting, and primitive geometry so the difference is visible without relying on color alone.

- [ ] **Step 4: Add boss telegraph geometry and counter surfaces.**

Every warning uses a strong outline, shape, animation, and a non-color cue. Keep safe paths physically connected and wide enough for the intended mobile controls.

- [ ] **Step 5: Record provenance and inspect the rebuilt place.**

Update `assets/asset-ledger.json` to state that these assets are generated from project-authored Luau/native primitives with no third-party inputs. Build, open the generated place, and inspect all silhouettes and spawn/telegraph bounds in Studio.

### Task 7: Implement touch-first HUD, input, and feedback

**Files:**
- Create: `projects/misprint-menagerie/src/client/IndexHud.client.luau`
- Create: `projects/misprint-menagerie/src/client/EncounterHud.client.luau`
- Create: `projects/misprint-menagerie/src/client/InputController.client.luau`
- Create: `projects/misprint-menagerie/src/client/PresentationController.client.luau`
- Create: `projects/misprint-menagerie/src/shared/HudState.luau`
- Create: `projects/misprint-menagerie/src/client/InputContextBuilder.client.luau`
- Create: `projects/misprint-menagerie/tests/hud-state.spec.luau`

**Interfaces:**
- The Index shows six cards, locked/unlocked state, unlock challenge, and a three-card loadout.
- The encounter HUD shows three large card call buttons, two-summon capacity, Follow/Hold/Focus controls, objective, boss phase/health, safe-zone warnings, and command rejection feedback.
- `HudState.initial()` and `HudState.reduce(state, payload)` derive presentation state from server messages without mutating card ownership or combat state.
- `InputContextBuilder` creates the approved actions/bindings for keyboard, mouse, gamepad, and touch; all bindings dispatch the same client intent functions.
- Client sends intent only and renders server snapshots/rejections. It never increments unlocks, applies damage, or decides a hit.

- [ ] **Step 1: Write tests for the client state reducer.**

Create `hud-state.spec.luau` with these assertions:

```lua
local shared = game:GetService("ReplicatedStorage"):WaitForChild("MisprintShared")
assert(shared:FindFirstChild("HudState"), "HudState module is missing")
local hud = require(shared.HudState)
local state = hud.initial()
assert(state.screen == "index")
state = hud.reduce(state, { kind = "encounter_state", phase = "phase_one", bossHealth = 100 })
assert(state.screen == "encounter" and state.phase == "phase_one")
local ownedBefore = state.ownedCardIds
state = hud.reduce(state, { kind = "call_rejected", reason = "summon_limit" })
assert(state.message == "summon_limit", "rejected call should be visible")
assert(state.ownedCardIds == ownedBefore, "server event cannot grant a card")
local same = hud.reduce(state, { kind = "unknown_payload" })
assert(same.screen == state.screen, "unknown payload must preserve current screen")
```

- [ ] **Step 2: Run the assertions and confirm the reducer is missing.**

Execute the test code against a local Studio Client DataModel and confirm the expected missing-module failure.

- [ ] **Step 3: Implement a small pure `HudState` reducer and rerun.**

Keep state derivation separate from Instance construction so its assertions remain deterministic.

- [ ] **Step 4: Build the Index and encounter UI.**

Use readable text, large touch targets, clear locked-card explanations, captions/visual equivalents for audio warnings, and reduced-motion behavior for strong flashes or screen movement.

- [ ] **Step 5: Wire controls to server intents.**

Use `InputContext`, `InputAction`, and `InputBinding` from Roblox's current Input Action System. Verify the Workspace setting is enabled in the generated place, then map summon selection, call confirmation, and Follow/Hold/Focus to keyboard, mouse, gamepad, and touch. Use large GUI buttons for card selection and bind touch actions to those buttons. Do not add a second input path that bypasses the same server intent validation.

- [ ] **Step 6: Review layouts in mobile and desktop viewports.**

Run a Studio viewport/device review and controller emulation. Expected: card actions, warning shapes, and objectives remain readable without covering the boss or summon landing regions; every supported device can select a card, choose a call, and issue each command.

### Task 8: Integrate, playtest, and record the vertical slice

**Files:**
- Modify: `projects/misprint-menagerie/README.md`
- Modify: `assets/asset-ledger.json`
- Create: `evidence/studio/misprint-menagerie-playtest.json`
- Create: timestamped `evidence/studio/misprint-menagerie-*.jpg` files and metadata sidecars for actual captures

**Interfaces:**
- The README states verified and unverified behavior separately.
- Evidence records UTC timestamp, Studio instance ID, place identity, build identity, action, result, and console/capture references.

- [ ] **Step 1: Run the repository suite and inspect the build report.**

Run: `.\scripts\test-all.ps1` from the repository root.

Expected: Node suite passes, Luau sources parse, and base, Signal Garden, and Misprint Menagerie build. Record any pre-existing failures separately; do not hand-edit evidence to make a gate pass.

- [ ] **Step 2: Confirm the live Studio target before testing.**

Call `list_roblox_studios`, confirm the generated unpublished Misprint Menagerie place is open, and record its ID. If the wrong place is open, stop live tests and open the generated build without saving over any other place.

- [ ] **Step 3: Verify a complete solo hunt.**

Start Play. Exercise portal entry, all intended card calls, boss phase one, boss phase two, deterministic unlock, return/retry, and knockout recovery. Review client/server logs.

- [ ] **Step 4: Verify two- and three-client hunts.**

Use Studio Server & Clients testing. Verify call replication, team counters, one-player disconnect cleanup, late-join rejection, all-player exit cleanup, one-time rewards, and simultaneous knockout behavior.

- [ ] **Step 5: Verify invalid requests and mobile presentation.**

Use `execute_luau` in Server mode to issue bounded malformed, stale, unauthorized, out-of-range, over-rate, and over-capacity requests. Use Studio device simulation and viewport capture for the mobile HUD and safe-zone warnings.

- [ ] **Step 6: Capture real evidence and update the README.**

Use the official Studio capture flow. Store raw result and provenance metadata; if a gate fails, preserve the failure and create a follow-up implementation task. Do not save or publish the place.

- [ ] **Step 7: Run a small first-run player session.**

Observe whether players can find a summon, understand a boss warning, select a useful counter, and decide whether to replay. Record observations and participant count without collecting unnecessary personal data. Treat this as usability evidence only, not market validation.

## Plan Self-Review

- **Spec coverage:** Core loop, six cards, three-card loadout, two active summons, deterministic session-only unlocks, one Index, one arena, two boss phases, mobile/PC presentation, server authority, disconnect/knockout/reward behavior, no monetization, no publishing, and evidence gates map to Tasks 2–8.
- **Placeholder scan:** No task says “TBD,” “implement later,” or “write tests for the above.” Every gameplay rules task has an assertion-first test sequence.
- **Type/interface consistency:** `CardCatalog` IDs are used by `CollectionRules`, `CombatRules`, and `CreatureBuilder`; `EncounterRules` owns phase and reward idempotency; `Bootstrap.server.luau` wires services; client modules submit intents and consume server state.
- **Workspace safety:** Only the new project, asset ledger entry, README, and truthful Studio evidence are in scope. Generated builds remain ignored. No commit is included because the repository has no existing HEAD.
