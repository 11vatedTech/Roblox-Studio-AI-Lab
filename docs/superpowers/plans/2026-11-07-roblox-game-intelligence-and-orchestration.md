# Roblox Game Intelligence and Task Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Lab a structured, extensible understanding of Roblox engine capabilities, game design/creative disciplines, and verified production outcomes, then use that graph to create real, reviewable specialist task plans.

**Architecture:** Store compact versioned JSON records and source-linked Markdown in `docs/game-intelligence/`; validate records with bounded local code; connect them to a deterministic dependency planner and task registry under `docs/tasks/`. The control center searches and renders this data but does not launch arbitrary commands, call arbitrary MCP tools, or claim that static retrieval is autonomous understanding.

**Tech Stack:** Node.js 20 or newer, ES modules, Node’s built-in test runner, JSON/Markdown, the existing loopback Node server and vanilla browser UI, official Roblox documentation and Studio MCP as versioned sources.

## Global Constraints

- The taxonomy is multi-label and extensible; unknown and hybrid concepts remain valid inputs.
- The three systems are Roblox Engine Intelligence, Game Design & Creative Intelligence, and Verified Production Intelligence.
- Game families, mechanics, styles, animation, platform capabilities, assets, specialist responsibilities, tasks, tests, benchmarks, and evidence are linked by stable typed IDs.
- Each knowledge record contains source, retrieval/review date, Roblox/Studio version and feature state, assumptions, owner, and L1–L4 maturity.
- Do not add a required vector service, model provider, API key, paid dependency, or remote storage.
- The task planner may propose file ownership and permissions, but human review is required for creative decisions and external/production operations.
- Task records are stored only within `docs/tasks/`; no arbitrary destination path is accepted.

---

### Task 1: Define schemas and stable IDs

**Files:**
- Create: `docs/game-intelligence/README.md`
- Create: `docs/game-intelligence/schemas/record.schema.json`
- Create: `docs/game-intelligence/schemas/task-graph.schema.json`
- Create: `docs/game-intelligence/schemas/specialist.schema.json`
- Create: `src/core/knowledge-record.js`
- Create: `tests/knowledge-record.test.js`

**Interfaces:**
- Knowledge record IDs use lowercase kebab-case with explicit domain prefixes such as `genre.rpg-adventure` and `mechanic.movement-grapple`.
- `validateKnowledgeRecord(record)` returns `{ valid, errors }`; accepted record kinds are `engine-capability`, `game-family`, `mechanic`, `visual-style`, `animation-domain`, `product-pattern`, `production-pattern`, and `failure-pattern`.
- `validateTaskGraph(graph)` rejects missing IDs, invalid edge types, dependency cycles, unknown statuses, and file ownership collisions.

- [ ] Write tests for one valid record of each record kind, duplicate IDs, missing source provenance, unsupported maturity promotion, and invalid platform-state values.
- [ ] Define JSON Schemas with stable field names for dependencies, compatibility, conflicts, failure modes, source provenance, platform state, and evidence links.
- [ ] Implement dependency-free runtime validation with field-path errors and no silent field coercion.
- [ ] Document the ID scheme, review cadence, allowed statuses, and how to add an unknown discipline without inventing knowledge.

Run:

```powershell
node --test tests/knowledge-record.test.js
```

Expected: schemas and runtime validation reject the same malformed records; no record reaches L3/L4 without linked execution/certification evidence.

### Task 2: Seed the open game-family and mechanic catalogue

**Files:**
- Create: `docs/game-intelligence/records/genres/*.json`
- Create: `docs/game-intelligence/records/mechanics/*.json`
- Create: `docs/game-intelligence/records/visual-styles/*.json`
- Create: `docs/game-intelligence/records/animation-domains/*.json`
- Create: `docs/game-intelligence/records/engine-capabilities/*.json`
- Create: `docs/game-intelligence/records/product-patterns/*.json`
- Create: `docs/game-intelligence/research-log.md`

**Interfaces:**
- Every record includes `id`, `kind`, `version`, `summary`, `designKnowledge`, `technicalPatterns`, `dependencies`, `failureModes`, `testing`, `performance`, `sourceRefs`, `platformState`, `maturity`, `owner`, and `reviewedAt`.
- Genre records use multi-label related families and describe player experience, loop, progression/economy, multiplayer, art/animation demands, product risks, and specialist requirements.
- Mechanic records enumerate input, states/transitions, rules, animation, physics, UI, audio/VFX, networking, security, device support, failure cases, and repeatable tests.

- [ ] Seed RPG/adventure; action/combat/fighting; FPS/TPS/competitive multiplayer; racing/vehicles; horror/survival/extraction; simulation/management/tycoons; strategy/tactics/tower defense/card battlers; collection/progression/gacha/creature collection; social/roleplay/party/social deduction; platforming/movement/obbies; sports/recreation; puzzle/escape; sandbox/creative; survival crafting; cooperative multiplayer; narrative; and experimental/hybrid experience families, with the approved subgenres and explicit cross-family links.
- [ ] Seed mechanic records for movement, combat, weapons, abilities, progression, inventory, economy, collection, interaction, AI/NPCs, simulation, procedural generation, destruction, quests/narrative, social, multiplayer, and world systems.
- [ ] Seed photorealism, stylized realism, anime/cel shading, hand-painted 3D, cartoon, low-poly, voxel, gothic/high fantasy, science fiction/cyberpunk, steampunk/dieselpunk/biopunk/solarpunk, horror, cozy/whimsical, historical, industrial/post-apocalyptic, surreal/abstract, retro, mixed-media, underwater/deep-sea, cosmic, and experimental visual styles.
- [ ] Seed character, combat, creature, locomotion, facial/expression, cinematic, physics-driven, IK/procedural, animation graph/state-machine, environment/machinery, UI-motion, and VFX-synchronization animation domains.
- [ ] Seed engine capability records for DataModel/Rojo, Luau analysis, rendering/materials/import, animation/rigging, UI/camera/input, physics, audio/effects, NPC/pathfinding, networking/authority, persistence/streaming, device/performance, analytics, and permission boundaries; seed product patterns for onboarding, replay, economy ethics, and player-value research.
- [ ] Cite current official Roblox material for engine facts and identify whether every reference is stable, beta, experimental, announced, deprecated, or unknown; mark design estimates separately from verified implementation claims.

Expected: every minimum family and discipline has an L1/L2 record with source and limits; no claim of L3/L4 is made before a benchmark produces evidence.

### Task 3: Add a safe local knowledge store and structured search

**Files:**
- Create: `src/services/knowledge-store.js`
- Create: `tests/knowledge-store.test.js`
- Modify: `src/server/app.js`
- Modify: `tests/lab-server.test.js`
- Modify: `apps/control-center/public/app.js`
- Modify: `apps/control-center/public/index.html`
- Modify: `apps/control-center/public/app.css`

**Interfaces:**
- `loadKnowledge(rootDir)` reads only JSON records below `docs/game-intelligence/records/`, rejects symlinks and excessive depth/file sizes, validates records, and returns `{ records, diagnostics }`.
- `searchKnowledge(rootDir, { query, kinds, familyIds, mechanicIds, platformState, maturity })` returns bounded matches with stable IDs, source links, status, and diagnostic counts.
- `GET /api/knowledge` accepts bounded filter query parameters; it exposes no generic file path argument.

- [ ] Add tests for malformed JSON, invalid records, symlink escape, overlarge input, duplicate IDs, and deterministic sorted results.
- [ ] Add a read-only knowledge endpoint with strict query allowlists and hard result limits.
- [ ] Add a knowledge workbench view that lets an operator filter by genre, mechanic, visual style, animation, platform state, and maturity.
- [ ] Confirm that the dashboard remains loopback-only and the Studio client’s fixed read-only allowlist has not changed.

Run:

```powershell
node --test tests/knowledge-store.test.js tests/lab-server.test.js
```

Expected: structured filtering works offline; unknown/stale/invalid records remain visible as diagnostics and cannot silently disappear from a plan.

### Task 4: Define role capabilities and artifact handoffs

**Files:**
- Create: `docs/game-intelligence/specialists/registry.json`
- Modify: `docs/workflows/agent-handoff.schema.json`
- Modify only where needed: `skills/roles/*.md`
- Create: `tests/specialist-registry.test.js`

**Interfaces:**
- Specialist entries declare stable ID, division, capabilities, input artifacts, output artifacts, permitted tools/operation classes, required independent reviewer, and linked role contract path. Divisions are Game Intelligence, Creative Production, Engineering, Quality & Verification, and Product & Operations.
- Extend the handoff with `taskIds`, `dependencyStatus`, `fileOwnership`, `capabilityIds`, and `evidenceRefs`; retain current required fields and the `passed|failed|blocked|not_run` statuses.

- [ ] Map existing role files to capability IDs before creating any new role contract.
- [ ] Add only missing responsibility contracts, including genre research, mechanics architecture, player experience, narrative/worldbuilding, production coordination, and independent visual QA.
- [ ] Map the full five-division responsibilities from the closure spec, including concept/art/materials/rig/animation/VFX/audio/UI production, networking/physics/NPC engineering, security/performance/accessibility QA, and product/research/privacy/release operations.
- [ ] Test that every registry contract path exists, each output type has a consumer, and no task assigns its author as its independent reviewer.
- [ ] Validate handoff compatibility with a current schemaVersion 1 fixture and a new fixture containing task/evidence links.

Expected: specialist files are callable work contracts in an executable task graph, not standalone prompt additions.

### Task 5: Implement dependency planning and task state

**Files:**
- Create: `src/services/task-planner.js`
- Create: `src/services/task-store.js`
- Create: `tests/task-planner.test.js`
- Create: `tests/task-store.test.js`
- Modify: `src/server/app.js`
- Modify: `tests/lab-server.test.js`
- Create: `docs/tasks/.gitkeep`

**Interfaces:**
- `composePlan({ brief, records, specialists })` returns `{ capabilityIds, tasks, edges, unknowns, assumptions, reviewGates }`; it computes dependency closure, topological ordering, missing-record diagnostics, and file ownership conflicts.
- `createTaskPlan(rootDir, plan)` validates and stores one immutable JSON plan beneath `docs/tasks/` using the validated plan ID as the filename; status changes are append-only events within the same record, not arbitrary file edits.
- `GET /api/tasks` lists plans by bounded status/project filters; `POST /api/tasks/plan` accepts a bounded brief and stores a `proposed` graph for human review. `POST /api/tasks/:id/transition` accepts only allowed status transitions with a validated evidence reference where required. Neither route executes commands or invokes tools.

- [ ] Test a valid acyclic plan, dependency cycle rejection, missing knowledge node, duplicate file ownership, blocked prerequisite, and independent-reviewer conflict.
- [ ] Test that path traversal, symlink roots, oversized briefs, unregistered roles, and unapproved operation classes are rejected.
- [ ] Implement deterministic dependency closure and stable topological sorting; report unresolved domains as `unknowns` rather than selecting the nearest template.
- [ ] Add server endpoints and task-list/detail UI with explicit proposed, approved, in_progress, blocked, review, passed, and failed states.
- [ ] Test status transition rules and evidence requirements; a task cannot become `passed` without its required output and validated evidence reference.

Run:

```powershell
node --test tests/task-planner.test.js tests/task-store.test.js tests/lab-server.test.js
```

Expected: task graphs can be planned, reviewed, advanced, rejected, and audited without launching an agent or arbitrary process.

### Task 6: Demonstrate cross-client task execution

**Files:**
- Create: `docs/testing/task-orchestration-exercise.md`
- Add handoff artifacts under: `docs/tasks/`
- Update: `docs/game-intelligence/research-log.md`

**Interfaces:**
- The exercise consumes one approved project brief and registered knowledge records, then produces a proposed task graph, real agent handoffs, returned artifacts, evidence links, review result, and a recorded maturity decision.

- [ ] Submit one concept brief that combines at least three families and mechanics not stored together as a prebuilt example.
- [ ] Review the proposed roles, file ownership, permissions, dependency order, unknowns, and acceptance evidence before assigning work.
- [ ] Have two compatible client sessions consume bounded tasks through the shared records; record actual artifact return, status transitions, conflict handling, and independent review.
- [ ] Run an adversarial review that checks missing dependencies, hidden assumptions, task completion without artifacts, and reviewer independence.

Expected: at least one real task cycle completes through repository handoffs; if a client lacks a supported adapter, the handoff remains explicit and human-directed rather than claiming an automated integration.
