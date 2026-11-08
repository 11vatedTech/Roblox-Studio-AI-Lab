# AI Roblox Studio Lab — Showcase Experience

**Experience title:** Signal Garden

An original cooperative exploration slice about restoring a night marsh through resonance. This source project extends the Lab's base Rojo shape with server-owned gathering, shared relay charging, a timed two-station route puzzle, route-dependent world response, and a short replay cycle.

## Build and open

From the Lab root, run `scripts/build-all.ps1`. The pinned local Rojo binary builds `projects/signal-garden/default.project.json` to a timestamped `.lab-runtime/builds/signal-garden-*.rbxlx` file. Open the generated file in Roblox Studio. Source is the editable canonical version; the exported place file is generated.

## Play

Use the ProximityPrompt input shown by Roblox (keyboard, controller, or touch):

1. Explore the four reed banks and collect at least three Echo fragments.
2. Return to the central archive and deposit three fragments into the shared relay.
3. Choose the Moss or Bloom route at the archive. The first choice locks for this run.
4. Within 18 seconds, activate both resonance plates. Two players should divide the plates; a one-player server has a deliberate solo fallback.
5. Watch the selected habitat wake, receive a shared restoration, and collect again after the short reset.

The server validates fragment and prompt ancestry, type, character, distance, phase, cooldown and resource counts. Clients only request state snapshots; they cannot grant fragments, select routes or complete the relay.

## Current delivery boundary

The source creates an original, stylized blockout using Roblox Terrain and native parts. Its landmarks, palette, fog, beacon silhouettes, and route response establish a visual direction, but this is not finished environment art. The prior local Studio run found MossSwitchA centered at X=-27, five studs beyond the central platform's X=-22 edge, and navigation dropped the avatar below the platform. The source now creates collidable, coplanar support extensions for the two outer plates, MossSwitchA and BloomSwitchB, with a two-stud overlap onto the central platform. A new single-player Play run on generated build `signal-garden-20261107-175946294.rbxlx` (place and game IDs 0) traversed both supports, completed both Moss and Bloom routes with normal E prompts, observed relay timeout recovery, and observed the restoration reset. The run returned Studio to Edit without saving. Two-client coordination, touch/controller input, device profiling, and the very dark blockout's final art quality remain unverified. See `evidence/studio/signal-garden-p0-run.json`.

The flower prop is source-reproducible: two isolated Blender 5.2.0 LTS builds matched the current `.blend` geometry/material signature (920 triangles across three meshes). Blender-generated file hashes differ across runs, so the signature is recorded separately from artifact hashes in `assets/models/signal-garden/SignalBloom-build.json`. `SignalBloom` remains absent from `default.project.json` and the opened generated build; no representation has been verified to survive a clean Rojo build and reopened Studio place, and no import or upload was attempted. Roblox's Importer supports FBX and has an “Upload to Roblox” option; its documentation says that option controls whether the model is added to inventory, so it does not by itself establish a fully local workflow. Do not treat the mesh as integrated without a verified unpublished-place test and explicit no-upload evidence. See `docs/showcase/signal-garden-design.md`, `docs/reviews/2026-11-06-repository-and-freebuff-audit.md`, and `evidence/studio/signal-garden-p0-run.json`.
