# Lab Recovery and P0 Repairs Implementation Plan

> **Execution status (2026-11-07):** Implemented inline on `codex/lab-recovery-p0` in the existing checkout. The user explicitly chose no initial commit and no Git identity was configured. Offline source checks, restore verification, and both single-player Studio routes pass. Two-client/device testing and Roblox asset import/reopen remain blocked; desktop automation still denies access despite the user's approval.

**Goal:** Establish a reviewed, restorable source baseline and close the current P0 path-policy, Signal Garden traversal, and SignalBloom reproducibility/integration gaps.

**Architecture:** Keep the baseline local and review its complete file inventory before source recovery. Strengthen the existing path policy rather than introducing a second filesystem abstraction. Repair the canonical Luau project sources and reproduce the original SignalBloom from its Blender source; record a local Roblox import strategy only after a clean Rojo build and Studio reopen prove it.

**Tech Stack:** Node.js 20 or newer and `node:test`; PowerShell; pinned Luau 0.745 and Rojo 7.7.1; Blender 5.2; Roblox Studio through its official local MCP server.

## Global Constraints

- Do not push or configure a remote. Hosted CI is optional.
- Before live Studio work, call `list_roblox_studios`, select by returned instance ID, confirm the place, and inspect the DataModel.
- Do not upload SignalBloom or enable Open Cloud. If no local source representation survives Rojo build and Studio reopen, record that gate as blocked and request a separately authorized route.
- Do not overwrite generated/user assets without checking source status and preserving a recoverable copy.
- Run `npm test`, `scripts/lint-luau.ps1`, and `scripts/build-all.ps1` after relevant changes; do not report Studio or device validation without its actual evidence.

---

### Task 1: Review the repository inventory and establish a local recovery point

**Files:**
- Modify: `.gitignore`
- Modify: `scripts/backup.ps1`
- Create: `scripts/verify-backup.ps1`
- Review only: `.gitattributes`, `README.md`, root manifests, `apps/`, `src/`, `tests/`, `docs/`, `projects/`, `assets/`, `skills/`, `roblox/`, and `evidence/`

**Interfaces:**
- `scripts/backup.ps1` continues to create a timestamped local archive and prints its full path, byte count, and timestamp.
- `scripts/verify-backup.ps1` accepts one archive path, extracts only into a newly created temporary directory, verifies the required source roots and key manifests, and exits nonzero on a missing root or unsafe archive entry.

- [x] Enumerate the full `git status --short`, inspect `.gitignore`, and review the proposed baseline file list for credentials, local runtime files, generated build outputs, and unrelated user files.
- [x] Update the fixed backup path list to include `.agents`, `apps`, `src`, `tests`, `evidence`, `docs`, `projects`, `assets`, `skills`, `roblox`, scripts, and root manifests; exclude `.git`, `node_modules`, `.lab-runtime`, `.lab-backups`, `.tools` downloads, `*.blend1`, `evidence/generated/`, and nested `.rojo*` runtime files.
- [x] Add a restore verifier that rejects unsafe archive paths and links, extracts into a unique temporary directory, and checks required files and source roots while allowing OneDrive Cloud Files reparse tags.
- [x] Create an archive and restore it to a clean temporary directory; compare file path and SHA-256 manifests for all included source files. A fresh final archive is recorded after documentation/evidence updates below.

Run:

```powershell
./scripts/backup.ps1
$archive = Get-ChildItem .lab-backups/lab-source-*.zip | Sort-Object LastWriteTime -Descending | Select-Object -First 1
./scripts/verify-backup.ps1 -ArchivePath $archive.FullName
```

Expected: restore verification reports all required roots and matching source hashes; generated runtime directories and `.git` are absent. Per the user's explicit choice, the reviewed source remains uncommitted on the recovery branch; no author identity or remote is configured.

### Task 2: Make the path contract host-independent

**Files:**
- Modify: `src/core/path-policy.js`
- Modify: `SECURITY.md`
- Modify: `docs/security/path-policy.md`

**Interfaces:**
- Keep `validateProjectName(value)` returning a validated slug or throwing `INVALID_PROJECT_NAME`.
- Keep `resolveWithin(root, ...segments)` returning an absolute child path or throwing a stable path-policy error. It must reject absolute, drive-qualified, UNC, rooted, traversal, NUL, and separator-smuggling inputs independent of the host OS.

- [x] Expand the test table to include Windows drive roots, drive-relative paths, UNC paths with both slash forms, POSIX roots, `..` segments, embedded slash/backslash, NUL, and valid nested components.
- [x] Add a symlink case on hosts that support symlink creation; skip only when the OS denies creating a test symlink and report that reason.
- [x] Implement host-independent pre-validation before `path.resolve`, then retain the existing containment check.
- [x] Run the focused suite on Windows and a POSIX Node host before claiming cross-platform behavior. Both passed 6/6; logs are recorded under `evidence/p0/`.

Example assertion required in `tests/path-policy.test.js`:

```js
for (const segment of ['C:\\outside', 'C:outside', '\\\\server\\share', '/etc/passwd', '..\\outside', 'folder\\..\\outside']) {
  assert.throws(() => resolveWithin(root, segment), (error) => ['INVALID_PATH', 'PATH_OUTSIDE_ROOT'].includes(error.code));
}
```

Run:

```powershell
node --test tests/path-policy.test.js
npm test
```

Expected: valid project-relative segments remain accepted; every absolute or escaping form is rejected on every tested host.

### Task 3: Repair and certify the Signal Garden traversal loop

**Files:**
- Modify: `projects/signal-garden/src/server/WorldBuilder.luau`
- Modify: `projects/signal-garden/src/shared/GardenConfig.luau`
- Modify: `projects/signal-garden/src/server/GardenService.luau` only if the Studio scenario reveals a state/reset defect
- Update after evidence: `projects/signal-garden/README.md`, `docs/showcase/signal-garden-design.md`, `assets/asset-ledger.json`
- Create: `evidence/studio/signal-garden-p0-run.json` plus corresponding captures through the established capture flow

**Interfaces:**
- Preserve the server-owned collection → deposit → route-choice → two-plate → restoration/reset state sequence.
- Preserve separate route prompts and collidable support geometry; client input never decides whether a plate is activated.

- [x] Inspect the generated map in Studio and measure the hub and outer supports. The hub and both outer pad top surfaces are at Y=9; both supports are anchored, collidable, 14×2×14, and overlap the hub by two studs.
- [x] Add collidable support extensions beneath both outer plates, overlapping the hub surface; the visual switch meshes and server-owned prompts remain separate. A solo player traversed to both outer plate areas with normal E prompt input.
- [x] Verify active-route prompt enablement and relay timeout recovery. Moss prompts enabled while Bloom prompts were disabled; an expired relay returned to route choice with the retry message.
- [x] Run and record the full objective solo for both Moss and Bloom, including three collections, three deposits, two plate activations, restoration, and reset. Evidence: `evidence/studio/signal-garden-p0-run.json` and linked captures.
- [ ] Run the cooperative objective with two real clients. Desktop automation returned `Computer Use was not approved to use Roblox Studio` despite the user's approval; available MCP play control supports only a single-player run.
- [ ] Verify touch/controller prompts, respawn/reconnect behavior, and representative device profiles.

Before any live test:

```text
Call list_roblox_studios → select the intended Studio instance ID → confirm the Signal Garden place identity → inspect the DataModel and current save state.
```

Expected: both routes have supported collidable traversal and the restoration/reset loop works solo. Cooperative and alternate-input gates remain `blocked` until tested with multiple real clients and device input.

### Task 4: Reproduce SignalBloom and settle a no-upload project representation

**Files:**
- Modify: `assets/models/signal-garden/build_signal_bloom.py`
- Modify after the representation spike: `projects/signal-garden/default.project.json` and, if required, new source-controlled model/metadata under `projects/signal-garden/src/shared/`
- Modify: `assets/models/signal-garden/SignalBloom-build.json`
- Modify: `assets/asset-ledger.json`
- Update: `docs/workflows/asset-provenance.md`

**Interfaces:**
- Run Blender in a separate background process with a factory-startup scene; never clear an interactive user scene.
- Build metadata records Blender version, export settings, object/triangle/dimension data, and SHA-256 hashes for `.blend`, FBX, and preview outputs.
- The project manifest may reference only a representation that survives a clean Rojo build and Studio reopen without an upload.

- [x] Add a non-destructive CLI entry point that builds from `--background --factory-startup` and fails if required outputs are missing or empty.
- [ ] Prototype the supported Roblox-local representations in an isolated copy; inspect mesh count, pivot, scale, materials, collisions, import warnings, and the resulting serialized model. Blender-side FBX inspection passed, but Roblox integration remains blocked.
- [ ] Select one representation only after its FBX/imported result appears in both a clean Rojo build and a reopened unpublished Studio place.
- [x] Update the build record and asset ledger with source/export hashes, class `Supporting`, rights status, and current evidence. Roblox import record, collision certification, and device budget remain explicitly unset pending Studio integration.

Run:

```powershell
$blender = (Get-Command blender -ErrorAction Stop).Source
& $blender --background --factory-startup --python assets/models/signal-garden/build_signal_bloom.py
./scripts/build-all.ps1
```

Expected: the rebuild matches the documented source/export settings, the clean Rojo output retains the model, and the reopened place contains it with verified hierarchy and collision. No asset upload occurs. If the local format cannot preserve required mesh data, record the tested limitation and stop before adding a misleading asset reference.

### Task 5: Refresh stale status and close the P0 gate

**Files:**
- Update: `README.md`, `docs/superpowers/plans/2026-11-06-ai-roblox-studio-lab.md`, `docs/showcase/signal-garden-design.md`, `assets/asset-ledger.json`, and regenerated `evidence/build-report.json`

**Interfaces:**
- Generated evidence is regenerated only by its producing command; status documents link to evidence rather than hand-editing a passing report.

- [x] Run the required repository checks and all three Rojo builds after the source changes.
- [x] Update stale test/build statements to the observed command output and source digest.
- [x] Mark each P0 gate `passed`, `failed`, `blocked`, or `not_run`; attach restore, path-test, and solo Studio route evidence. Co-op/device and Roblox-asset-reopen evidence remain blocked and are not fabricated.
- [x] Confirm the recovery branch is the user's requested uncommitted state and the backup restores the recorded source tree. No commit was created, per the user's choice.

Run:

```powershell
npm test
./scripts/lint-luau.ps1
./scripts/build-all.ps1
git status --short --branch
```

Expected: source suites and all declared builds pass; Studio-only gates have actual evidence or remain explicitly blocked; documentation agrees with the generated reports.

## P0 gate status

| Gate | Status | Evidence or boundary |
|---|---|---|
| Recovery archive and restore | PASS | Fresh archive and matching restored-file hashes; path is reported in the handoff. |
| Host-independent path policy | PASS | Windows and POSIX focused suites both pass 6/6, including symlink traversal; logs are under `evidence/p0/`. |
| Signal Garden traversal repair | SOLO PLAYTEST PASS; CO-OP/DEVICE GATES BLOCKED | Both outer supports were inspected in the generated local build, both solo routes completed with E prompts, timeout returned to route choice, and reset returned the HUD to gather. See `evidence/studio/signal-garden-p0-run.json`; two-client and touch/controller testing remain blocked. |
| SignalBloom source reproduction | PASS AT SOURCE/BLENDER LEVEL | Two isolated Blender 5.2.0 builds match the source `.blend` canonical geometry/material signature. Output byte hashes vary and are recorded. |
| SignalBloom Roblox integration | BLOCKED | SignalBloom was absent from the generated local build and remains unmapped in Rojo. No import or upload was attempted; no no-upload representation has been verified through a clean build and Studio reopen. |
| Git baseline commit | SKIPPED BY USER CHOICE | Work remains uncommitted on `codex/lab-recovery-p0`; no Git identity or remote was configured. |
