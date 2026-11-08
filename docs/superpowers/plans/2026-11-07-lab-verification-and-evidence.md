# Lab Verification and Evidence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each Lab quality claim traceable to the exact source, command, toolchain, environment, Studio place, device profile, reviewer, and actual result.

**Architecture:** Extend the existing Node test suite and PowerShell gates rather than creating a second test framework. Add typed evidence records and a dedicated Studio test project that exercises existing `.spec.luau` rules in the real Roblox runtime; keep static analysis, build, Studio, physical-device, and product evidence as separate grades.

**Tech Stack:** Node.js 20 or newer with built-in `node:test`; PowerShell; Luau 0.745 CLI; Rojo 7.7.1; Roblox Studio official local MCP and built-in server/client testing; JSON Schema documents with bounded native validators and no mandatory new package.

## Global Constraints

- Keep dashboard and service operation local-only and bounded; do not add arbitrary file or command execution.
- `scripts/test-all.ps1` remains a local, credential-free check. Hosted CI is optional until an approved provider and remote are selected.
- Use `passed`, `failed`, `blocked`, and `not_run` without interpreting an unrun or blocked gate as success.
- A Luau parse is not type checking; static heuristics are not a security review; a screenshot is not gameplay proof; a local build is not a published game; emulator input/layout is not physical device performance.
- Record source commit or digest and dirty-tree status. Do not hand-edit generated reports into a passing state.
- Keep Studio evidence writes in named, bounded workflows. Do not add a generic file-write API; reconcile the repository’s evidence-root policy before adding new writers.

---

### Task 1: Define and validate evidence records

**Files:**
- Create: `docs/quality/evidence-record.schema.json`
- Create: `src/core/evidence-record.js`
- Create: `tests/evidence-record.test.js`
- Modify: `docs/workflows/release-certification.md`

**Interfaces:**
- `validateEvidenceRecord(value)` returns `{ valid: true, errors: [] }` or `{ valid: false, errors: [...] }`; it never writes files.
- Record fields include schema version, status, source revision/digest and dirty state, command/scenario, tool versions, UTC timestamp, environment/device, Studio instance/place if relevant, raw output/capture hashes, reviewer, and limitations.

- [ ] Write tests for all four statuses and required source identity fields.
- [ ] Reject a record with `passed` status and no source identity, and reject Studio evidence with no instance ID or place identity.
- [ ] Add the JSON Schema and a dependency-free runtime validator that returns stable field-path errors.
- [ ] Document evidence grades and the distinctions between source, build, Studio, device, visual, security, and product evidence.

Run:

```powershell
node --test tests/evidence-record.test.js
```

Expected: schema and runtime validation agree on required fields and invalid status combinations.

### Task 2: Add an isolated Roblox rules-test harness

**Files:**
- Create: `tests/roblox/TestRunner.server.luau`
- Create: `tests/roblox/misprint-test.project.json`
- Modify: `projects/misprint-menagerie/tests/combat-rules.spec.luau`
- Modify: `projects/misprint-menagerie/tests/encounter-rules.spec.luau`
- Modify: `projects/misprint-menagerie/tests/collection-rules.spec.luau`
- Modify: `projects/misprint-menagerie/tests/card-catalog.spec.luau`
- Modify: `projects/misprint-menagerie/tests/hud-state.spec.luau`
- Create: `docs/testing/roblox-rules-harness.md`

**Interfaces:**
- Each rules spec is a ModuleScript returning one `function()` that runs assertions and returns only after all assertions pass.
- `TestRunner.server.luau` requires every named `*.spec` ModuleScript in a dedicated test folder, runs each once in deterministic name order, logs one pass/failure line per module, and fails the session on any assertion failure.
- `misprint-test.project.json` maps only the modules required by the specs and the test runner; it does not include the production bootstrap.

- [ ] Confirm how pinned Rojo 7.7.1 maps the existing `.spec.luau` filenames; record the tested mapping in `docs/testing/roblox-rules-harness.md`.
- [ ] Convert each current top-level spec into a returned test function without changing the asserted gameplay rules.
- [ ] Add a runner that verifies the test folder exists, enumerates only ModuleScripts with the expected suffix, runs them in sorted order, and emits a failing assertion if a test throws.
- [ ] Build the test manifest and run it in an unpublished Studio session; capture the test list, Output result, Studio ID, place identity, and any remaining runtime limitations.

Expected: all five current rule specs execute in Studio server context with Roblox globals available; the ordinary game manifest remains free of test scripts.

### Task 3: Make source and build checks explicit and reproducible

**Files:**
- Modify: `scripts/lint-luau.ps1`
- Modify: `scripts/test-all.ps1`
- Modify: `scripts/build-all.ps1`
- Create: `scripts/write-check-evidence.ps1`
- Modify: `package.json` only if new scripts are needed
- Modify: `tests/` only for a specific failing assertion discovered during implementation

**Interfaces:**
- `scripts/lint-luau.ps1` reports parser and analyzer separately and only applies `luau-analyze` to modules whose environment is modeled accurately.
- `scripts/test-all.ps1` reports Node, Luau parse/analyze, Studio-dependent specs (as blocked when Studio is unavailable), and every Rojo build as distinct statuses.
- Build/evidence reports bind to `git rev-parse HEAD`, dirty-tree state, tool versions, platform, manifest paths, and actual process exit codes.

- [ ] Add tests that assert the current parser output is labeled syntax-only and cannot claim engine-aware type analysis.
- [ ] Run `luau-analyze` against isolated pure modules; capture its diagnostics and exclude engine-global files unless the real Roblox type definitions are available.
- [ ] Keep Node tests and the test-project build in the offline suite; report Studio runtime checks as `blocked` when no verified place is open.
- [ ] Add validation that generated build reports contain source revision/digest, dirty state, platform, pinned versions, exact manifests, and successful output paths.

Run:

```powershell
npm test
.\scripts\lint-luau.ps1
.\scripts\build-all.ps1
```

Expected: no report infers Studio, multiplayer, type, security, or device success from the offline commands.

### Task 4: Standardize Studio scenario evidence and independent review

**Files:**
- Modify: `src/services/capture-store.js`
- Modify: `src/server/app.js`
- Modify: `apps/control-center/public/app.js`
- Modify: `apps/control-center/public/index.html`
- Modify: `apps/control-center/public/app.css`
- Modify after owner review: `AGENTS.md` and `SECURITY.md`
- Modify: `tests/capture-store.test.js`
- Modify: `tests/lab-server.test.js`
- Create: `docs/quality/studio-scenario.schema.json`

**Interfaces:**
- Add only named workflows that validate a bounded project/scenario and append a validated metadata record to a fixed `evidence/studio` path; do not accept a destination path from the request. Before adding this writer, update and review `AGENTS.md` and `SECURITY.md` to allow this single bounded evidence root while preserving the ban on arbitrary file operations.
- A capture’s asset hash and Studio identity remain immutable; review status is stored separately as unreviewed, accepted, or rejected with reviewer and defects.
- A reviewer cannot certify an artifact authored by the same assigned worker in the task registry.

- [ ] Add a Node test that rejects metadata missing Studio instance, place identity, scenario, timestamp, or capture hash.
- [ ] Add server tests for same-origin mutation, body limits, unknown scenario IDs, and path traversal/symlink attempts.
- [ ] Add UI views for scenario state and review status without displaying a pass unless a validated record exists.
- [ ] Re-run the evidence tests and check that existing read-only Studio tool allowlists are unchanged.

Expected: evidence is append-only through a named validated path; existing image quota and integrity checks continue to pass; the dashboard displays unmeasured and blocked states truthfully.

### Task 5: Certify the verification workflow

**Files:**
- Update: `docs/workflows/release-certification.md`
- Update: `README.md`
- Update: `evidence/build-report.json` only through its generator
- Add reports/captures only through the named evidence workflows

**Interfaces:**
- Final status is derived from validated evidence records; an independent reviewer can mark a gate passed only when the source revision and required scenario outputs are present.

- [ ] Run the complete local suite from a clean worktree and a restored backup.
- [ ] Run the dedicated Roblox rules harness and one named server/client scenario in an identified unpublished place.
- [ ] Obtain independent visual and code review records; test that missing review evidence cannot advance a certification status.
- [ ] Reconcile every release checklist row with a report or an explicit blocked/not_run record.

Expected: an independent operator can reproduce the local checks; Studio-dependent results identify the exact actual place and remain separate from local build claims.
