# Verified Roblox Benchmark Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a compact internal library of real Roblox projects/scenes that demonstrate and certify reusable engineering, gameplay, visual, animation, networking, and device capabilities.

**Architecture:** Store each benchmark as source-controlled Rojo content with its own manifest, build instructions, deterministic scenarios, visual reference, target budget, known limitations, evidence, and maturity status. Build and certify each scene independently; link it into Game Intelligence only after an independent clean-checkout reproduction.

**Tech Stack:** Luau, Rojo 7.7.1, Roblox Studio official MCP, Blender 5.2 for source assets, Node/PowerShell repository gates, device simulator for layout/input, physical target devices for frame/memory certification.

## Global Constraints

- Benchmarks are narrow reference implementations, not substitutes for full genre production or flagship experience.
- Each benchmark has source, docs, build instructions, repeatable tests, expected results, measured performance, visual evidence, known limits, and independent certification.
- Do not claim physical device performance from Studio simulation or desktop-only data.
- No upload, publication, purchased asset, paid service, production setting, or live player data is needed for benchmark work.
- Original Hero art still follows the asset-factory plan and requires human approval.
- Register only results that can be reproduced; failed and blocked cases remain visible.

---

### Task 1: Define benchmark project and evidence contract

**Files:**
- Create: `docs/benchmarks/benchmark.schema.json`
- Create: `docs/benchmarks/README.md`
- Create: `src/core/benchmark-record.js`
- Create: `tests/benchmark-record.test.js`
- Create: `scripts/verify-build-report.ps1`
- Modify: `scripts/build-all.ps1`
- Modify: `scripts/test-all.ps1`

**Interfaces:**
- Benchmark records have `id`, `domain`, `manifest`, `sourceRevision`, `scenarios`, `expectedResults`, `deviceBudgets`, `visualReference`, `evidenceRefs`, `knownLimitations`, `owner`, and `maturity`.
- `validateBenchmarkRecord(record)` rejects missing scenarios, missing source provenance, unsupported maturity, missing expected results, or a certification claim without independent reviewer evidence.
- Build discovery recurses only under `projects/` for `default.project.json` manifests, excludes test-only manifests, uses repository-relative unique project IDs, and sorts results deterministically.

- [ ] Write validator tests for each required field, duplicate benchmark IDs, missing device profiles, and false L4 claims.
- [ ] Update the build script to find benchmark manifests recursively while still building the base template and current experience projects exactly once.
- [ ] Test duplicate leaf directory names and a nested test manifest to ensure reports use stable unique relative paths and do not build test-only maps as releases.
- [ ] Define one markdown checklist for source, test, performance, visual reference, known limits, and independent review.

Run:

```powershell
node --test tests/benchmark-record.test.js
./scripts/build-all.ps1
./scripts/verify-build-report.ps1
```

Expected: ordinary project output remains unchanged except for explicit new benchmark projects; the report lists every canonical manifest once with a stable path.

### Task 2: Build the character-combat-animation benchmark

**Files:**
- Create: `projects/benchmark-character-combat/default.project.json`
- Create: `projects/benchmark-character-combat/README.md`
- Create: `projects/benchmark-character-combat/src/`
- Create: `projects/benchmark-character-combat/tests/`
- Create: `docs/benchmarks/character-combat.json`

**Interfaces:**
- Scenario covers rig deformation, locomotion transitions, attack anticipation/recovery, hit-window synchronization, server-owned damage, camera/audio/VFX response, interruption, and reset.
- Expected results specify hit frame/state, valid target range, cancellation rules, server outcome, animation transition, and target-tier cost.

- [ ] Create a small authored rig and arena source with no uploaded asset dependency.
- [ ] Implement one attack with explicit state, hit window, server validation, client presentation, and cancellation/recovery.
- [ ] Test valid hit, miss, repeated request, stale state, interruption, respawn, and two-client synchronization.
- [ ] Capture repeatable front/side gameplay views and measure target device frame/memory behavior.

Expected: the attack timing and server outcome are reproducible in solo and multiplayer Studio runs; artistic approval remains separate from mechanics certification.

### Task 3: Build the movement and vehicle benchmarks

**Files:**
- Create: `projects/benchmark-movement/default.project.json`
- Create: `projects/benchmark-movement/README.md`
- Create: `projects/benchmark-movement/src/`
- Create: `projects/benchmark-movement/tests/`
- Create: `projects/benchmark-vehicles/default.project.json`
- Create: `projects/benchmark-vehicles/README.md`
- Create: `projects/benchmark-vehicles/src/`
- Create: `projects/benchmark-vehicles/tests/`
- Create: `docs/benchmarks/movement.json` and `docs/benchmarks/vehicles.json`

**Interfaces:**
- Movement scenarios cover acceleration, momentum, jump/dash/grapple cancellation as applicable, mobile/controller/keyboard input, collision recovery, and respawn.
- Vehicle scenarios cover handling, steering input, ownership/network behavior, collision, recovery, seat changes, and two-client synchronization.

- [ ] Define movement and vehicle budgets and expected trajectories before implementing the controls.
- [ ] Implement one movement loop and one vehicle loop with server validation and supported device inputs.
- [ ] Exercise edge cases and repeated resets in isolated Studio scenarios.
- [ ] Profile the representative workload on physical target hardware before marking performance maturity.

Expected: benchmarks expose repeatable motion/state behavior and failure recovery; no device or network status is inferred from an unprofiled local run.

### Task 4: Build environment, creature/NPC, and multiplayer benchmarks

**Files:**
- Create: `projects/benchmark-environment/default.project.json` and its README/source/tests
- Create: `projects/benchmark-creature-ai/default.project.json` and its README/source/tests
- Create: `projects/benchmark-multiplayer/default.project.json` and its README/source/tests
- Create: `docs/benchmarks/environment.json`, `docs/benchmarks/creature-ai.json`, and `docs/benchmarks/multiplayer.json`

**Interfaces:**
- Environment tests streaming/visibility, authored materials, lighting readability, collision, and lower-tier quality variants.
- Creature AI tests perception bounds, deterministic state transitions, navigation failure, animation state, server authority, and cleanup.
- Multiplayer tests authoritative state, replication, malformed/spam requests, join/leave/respawn, latency, and resynchronization.

- [ ] Create authored reference geometry and a small representative scene; record source, materials, and rights.
- [ ] Implement state and cleanup paths before adding visual effects or content density.
- [ ] Run repeatable one- and multi-client scenarios; capture expected state and failure evidence.
- [ ] Profile scene load/runtime, memory, physics/draw counts, and server heartbeat on named target devices.

Expected: benchmarks demonstrate real platform behavior and publish limitations, especially where platform APIs or emulation prevent a claim.

### Task 5: Build procedural-world and cinematic/UI benchmarks

**Files:**
- Create: `projects/benchmark-procedural-world/default.project.json` and its README/source/tests
- Create: `projects/benchmark-cinematic-ui/default.project.json` and its README/source/tests
- Create: `docs/benchmarks/procedural-world.json` and `docs/benchmarks/cinematic-ui.json`

**Interfaces:**
- Procedural generation records seed, constraints, bounds, navigation validation, deterministic expected structure, and controlled variation.
- Cinematic/UI scenarios verify animation/audio timing, camera control handoff, responsive layout, input, accessibility, skip/replay, and reduced-motion behavior.

- [ ] Define generation seed and bounds before implementation; add deterministic structure assertions.
- [ ] Define cinematic event timeline and explicit skip/interrupt behavior.
- [ ] Validate UI across touch/keyboard/controller layouts, safe areas, core UI/chat clearance, contrast, and reduced motion.
- [ ] Capture baseline views and run target hardware profiles for the densest cases.

Expected: repeatable generation and presentation behavior pass the expected-results table; inaccessible or unsupported modes remain explicit limitations.

### Task 6: Independently reproduce and register the benchmark portfolio

**Files:**
- Update: all eight `docs/benchmarks/*.json` records
- Update: `docs/game-intelligence/records/production-patterns/` with links to certified examples
- Add captures/reports via named evidence workflows

**Interfaces:**
- `validateBenchmarkRecord` accepts L4 only when the clean-checkout source digest, expected scenario results, target profile, evidence references, and independent reviewer all match the recorded benchmark.

- [ ] Rebuild each benchmark from a clean restore and verify its output against the recorded manifest and source digest.
- [ ] Have an independent reviewer reproduce the scenario and inspect the source, test, visual evidence, and target profile.
- [ ] Keep failed, blocked, or partial evidence visible; set L4 only when its exact scenario was reproduced and accepted.
- [ ] Link each verified implementation pattern to the engine, mechanic, asset, and test records it demonstrates.

Expected: eight compact capability areas have independent evidence; no benchmark’s certification is reused as proof for an untested genre or unrelated capability.
