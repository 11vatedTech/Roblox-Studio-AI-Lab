# Creative Asset Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible pipeline for original professional Roblox art that integrates AI-assisted ideation, Blender authoring/refinement, Roblox import, performance tiers, provenance, and separate technical and human artistic certification.

**Architecture:** Treat Blender source and editable textures as the authored source of truth; generated media is a traceable input that must be directed, refined, audited, and rights-reviewed. A versioned asset manifest links source hashes, exports, tool/dependency versions, import results, device budgets, and separate approval gates. The pipeline remains useful without a model provider and only claims AI-assisted execution when an actual supported model produces a recorded artifact.

**Tech Stack:** Blender 5.2 detected locally with Python automation; Roblox Studio importer and official local MCP; Rojo 7.7.1; Node.js asset-record validator and tests; JSON manifests; available local AI/model tools only after task-specific benchmarking.

## Global Constraints

- Every asset has one primary class: Hero, Major, Supporting, or Utility.
- Hero assets and final art direction require human visual approval; automation or vision analysis cannot certify artistic excellence.
- Preserve source `.blend`, source textures, generated source/prompts where policy permits, export settings, tool/dependency versions, hashes, Roblox import records, and evidence.
- The Lab’s reusable library contains Lab-original/owned or reuse-rights-documented material; project-specific licenses travel with each asset.
- Lower device tiers preserve essential silhouette, readability, identity, and gameplay while reducing only validated cost centers.
- Do not upload, buy, or publish an asset without explicit authorization for that exact action.
- Do not represent unfinished primitives as professional Hero/Major art; native Parts remain valid for utility, grayboxing, and intentional authored styles.

---

### Task 1: Create the asset-class, provenance, and acceptance contract

**Files:**
- Create: `docs/asset-factory/asset-record.schema.json`
- Create: `docs/asset-factory/visual-review.schema.json`
- Create: `src/core/asset-record.js`
- Create: `tests/asset-record.test.js`
- Modify: `assets/asset-ledger.json`
- Modify: `docs/workflows/asset-provenance.md`

**Interfaces:**
- `validateAssetRecord(record)` checks class, media kind (mesh, material, texture, rig, animation, VFX, sound, music, environment, or UI), source, rights, file hashes, tool versions, dependencies, export config, import/build record, budgets, and independent statuses.
- Technical statuses: `not_run|passed|failed|blocked`; integration, performance, and artistic statuses are separate. `Hero` cannot be `passed` artistically without a named human reviewer and approval timestamp.
- Visual review uses the anchored 1–5 rubric from the approved spec and records silhouette/shape language, modeling/geometric quality, materials, UV/texture integrity, artistic coherence, presentation/composition, readability, animation/deformation where applicable, Roblox integration, performance appropriateness, critical defects, target tier, references, reviewer, and decision.

- [ ] Test all four classes and reject an asset with zero or multiple primary classes.
- [ ] Test that a technical pass cannot set artistic approval, AI evaluation cannot set a Hero sign-off, and an unknown license cannot enter the reusable library as cleared.
- [ ] Add schemas and dependency-free runtime validation with stable field errors.
- [ ] Extend the asset ledger entries with source/export hashes, dependencies, usage rights, authoring versions, import data, separate gates, and evidence references.

Run:

```powershell
node --test tests/asset-record.test.js
```

Expected: the validator prevents technical checks, AI analysis, and asset presence from being mistaken for artistic approval or reuse rights.

### Task 2: Make Blender source builds reproducible and safe

**Files:**
- Create: `scripts/blender/asset_audit.py`
- Create: `scripts/blender/export_presets/signal-bloom.json`
- Modify: `assets/models/signal-garden/build_signal_bloom.py`
- Create: `tests/asset-build.test.js`
- Modify: `assets/models/signal-garden/SignalBloom-build.json` through the Blender build only

**Interfaces:**
- Blender invocation uses a separate `--background --factory-startup` process, explicit source path, explicit output directory, and pinned export preset.
- `asset_audit.py` outputs deterministic JSON checks for transforms, dimensions, object names, mesh/triangle counts, UV layers, texture references, material maps, rig/bone requirements, and missing dependencies.
- Build metadata records source/export/preview SHA-256, Blender version, preset digest, dependency manifest, mesh and texture statistics, and UTC build time.

- [ ] Define the signal-bloom export preset from the existing FBX 7.4, 1 Blender unit per stud, Y-up, -Z-forward configuration and compare it to the checked-in build metadata.
- [ ] Add the Blender audit and fail a fixture with an invalid transform, missing UV/material dependency, or out-of-budget mesh.
- [ ] Run a clean background build from the `.py` source twice and compare deterministic geometry/statistics and source/output hash records.
- [ ] Ensure the script refuses an output directory outside `assets/models/` or a designated ignored staging directory and never opens/clears the active interactive Blender file.

Run:

```powershell
$blender = (Get-Command blender -ErrorAction Stop).Source
& $blender --background --factory-startup --python scripts/blender/asset_audit.py -- assets/models/signal-garden/SignalBloom.blend
& $blender --background --factory-startup --python assets/models/signal-garden/build_signal_bloom.py
node --test tests/asset-build.test.js
```

Expected: audit output is deterministic for the same source and Blender release; missing inputs or failed budgets stop export with a nonzero status.

### Task 3: Integrate model-assisted ideation without assuming every model is suitable

**Files:**
- Create: `docs/asset-factory/model-capabilities.schema.json`
- Create: `docs/asset-factory/model-benchmarks.json`
- Create: `docs/asset-factory/generation-handoff.schema.json`
- Create: `docs/asset-factory/generation-evaluation.md`
- Create: `docs/asset-factory/audio-production.md`
- Modify: `skills/roles/technical-artist.md`
- Modify: `skills/roles/asset-specialist.md`

**Interfaces:**
- A generation handoff records model/tool and version, task type, prompt/settings where allowed, input/reference rights, raw output digest, transformations/refinement, dependencies, and human disposition.
- Capability records grade each actual tool/model for a specific task (concept, image inspection, texture creation, mesh generation, Blender refinement, animation, sound design, or music); no universal “best model” field is allowed.
- Tool use is adapter-neutral. A result is an artifact plus metadata; the factory never launches an arbitrary model or process from a dashboard request.

- [ ] Inventory only models/tools already available and benchmark them on task-specific quality and reproduction criteria; record “not tested” where inference is unavailable.
- [ ] Define a local concept-to-asset handoff that stores the candidate output under a project-controlled source path and preserves original plus refined versions.
- [ ] Add a review checklist for geometry defects, texture integrity, style mismatch, rights, and Roblox constraints before Blender integration.
- [ ] Exercise one actual AI-assisted concept or source-art task followed by deliberate Blender authoring/refinement; if no suitable authorized generator is available, record that exact capability as blocked rather than fabricating output.
- [ ] Define original music/audio source, stems, editability, tool/model provenance, rights, mix targets, and Roblox integration evidence; verify the official local import path before assuming audio can be used without a persistent upload.

Expected: at least one task-specific model capability is measured before it is used for production, and generated work remains traceable and editable through the complete lifecycle.

### Task 4: Verify the reusable Roblox import/build path

**Files:**
- Create: `docs/asset-factory/import-spike.md`
- Modify only after the spike: `projects/signal-garden/default.project.json`
- Modify after selection: `assets/asset-ledger.json`
- Add chosen canonical model under: `projects/signal-garden/src/shared/`
- Modify: `scripts/build-all.ps1` only if the chosen representation requires an explicit asset build step

**Interfaces:**
- The canonical asset representation must survive source checkout → Rojo build → Studio reopen with required hierarchy, scale/pivot, materials, collision, and no persistent upload.
- If no local representation preserves the source mesh, report which property is lost and keep the integration status blocked; do not add an unresolved `rbxassetid` reference.

- [ ] Test the local importer/export representations in a disposable copy of Signal Garden with no account scopes enabled.
- [ ] Inspect imported object count, mesh geometry, scale/pivot, materials, collision, memory cost, warnings, and canonical model serialization.
- [ ] Select the representation from those observed results, add the smallest canonical source artifact, and verify the clean build and reopened place.
- [ ] Store screenshots, import output, manifest digest, and a known-limitations record.

Expected: source-controlled asset integration is proven without upload, or the design names the exact missing platform capability and leaves the affected gate blocked.

### Task 5: Produce original sound and music source with a Roblox integration gate

**Files:**
- Create: `docs/asset-factory/audio-proof/brief.md`
- Create: `assets/audio-proof/source/` with editable project and source stems
- Create: `assets/audio-proof/audio-record.json`
- Create: `docs/asset-factory/audio-proof-review.md`

**Interfaces:**
- Audio records use the same source, rights, tool/version, hash, and review model, with tempo/key or sound-event purpose, loop points, sample rate/bit depth, mix targets, dynamic range, and target-device considerations where relevant.
- Do not upload or persist Roblox audio assets without explicit authorization; if Studio needs a persistent asset ID, keep integration `blocked` and preserve the fully authored/rights-reviewed source for the later authorized step.

- [ ] Compose or produce one original music cue and one gameplay sound set that follow an approved style identity.
- [ ] Preserve editable project/stems and deterministic exports; record rights and all tool/model provenance.
- [ ] Review loop seams, timing, mix clarity, interaction readability, and the relationship to animation/VFX.
- [ ] Verify current official local Studio audio import behavior; do not create an upload to test it.

Expected: original audio/music production and provenance reach L3 locally; Roblox playback integration is certified only if a supported no-upload path exists or a separate exact upload action is authorized.

### Task 6: Produce and certify an original Hero asset

**Files:**
- Create: `docs/asset-factory/hero-proof/brief.md`
- Create: `docs/asset-factory/hero-proof/art-direction.md`
- Create: original editable asset source and textures under `assets/hero-proof/`
- Create: `assets/hero-proof/asset-record.json`
- Add Studio evidence using the named evidence workflow under `evidence/studio/`

**Interfaces:**
- The Hero brief defines player function, silhouette, proportions, material language, animation/rig needs, readability distance, performance budget for midrange mobile and desktop, references and rights.
- The asset record links source hash, Blender build, export config, import/build record, visual rubric, technical/integration/performance results, and human artistic sign-off.

- [ ] Select a Hero proof that demonstrates original modeling and can be tested independently of the not-yet-selected flagship.
- [ ] Produce concept studies, editable Blender model, textures/materials, and any required rig/animation with documented provenance and iteration notes.
- [ ] Integrate into an unpublished benchmark scene, profile target devices, and preserve a lower-tier variant without changing the key identity.
- [ ] Obtain independent technical review, independent visual critique, and explicit human art-direction approval; record all dimensions and unresolved defects.

Expected: the asset is independently reproducible, professionally authored, Roblox-integrated, within declared device budgets, and artistically approved by a human. A failed or missing sign-off prevents Hero certification.
