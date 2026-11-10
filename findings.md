# Completion Findings

## Current repository checkpoint

- Branch: `codex/lab-recovery-p0`; HEAD: `b850a18e008ba8ce9fd82679dfb743e61689a8da`; work tree is dirty and preserved.
- Source snapshot before this planning file: `375bcc3ffd868a58835499fa97a9941c86a0137c6e4663872a87f00461b2284b`, 203 files excluding `evidence/`. This hash changes when this plan and later source edits are written.
- Capability status before new implementation: 2 `IMPLEMENTED`, 15 `IN_PROGRESS`, 3 `NOT_STARTED`, 2 `BLOCKED_EXTERNAL`, 1 `BLOCKED_HUMAN_APPROVAL`, 0 `VERIFIED`.
- Final package copy currently stored at `.lab-runtime/packages/lab-portable-20261108-completion-final2.zip`, SHA-256 `d18a32804b02ff56217972defe2cf7b6eb6ccee3cee5f9655b068152699f1af7`; clean extraction passed 96 Node tests, 38 Luau parses, and 3 Rojo builds. The source digest recorded at build is the pre-plan digest above.
- Package report `evidence/p0/lab-portable-package-completion-20261108.json` is SHA-256 `f2e4e828f302c4a6b82f096d58e557386f44ec2ea09e4d5ecc90dc31d34f1838`. Registry now has 28 records; targeted evidence/capability tests passed 10/10 after registration.

## Material gates

- Official Studio integration is available for local inspection and solo Play. A source-bound attempt collected the relic but navigation to the archive failed; no full restoration passed.
- Current Studio instance is `a6258a04-49cc-4211-b597-02ecc25d9aa2`; selected place is local `signal-garden-20261107-175946294.rbxlx` with PlaceId/GameId/PlaceVersion all 0. No save or publish was performed.
- No confirmed midrange phone, two-client UI result, player study, independent human security/art review, or hosted CI run is available. Pushing is unauthorized.
- Prior desktop metrics and historical solo-success record are explicitly unverified where source/place binding is absent.

## Required product boundary

The mandate is for the reusable Lab plus eight independent benchmark scenarios and a separate flagship candidate. Signal Garden is one existing graybox showcase and cannot be counted as the complete flagship or as all production proof.

## Benchmark and flagship constraints

- The canonical closure design requires eight small independent reference projects or scenes, with source, version/tool manifest, build instructions, risks, repeatable outcomes, visual reference, target profile, evidence, limitations, and maturity.
- The eight areas are combat/animation; movement/physics/mobile/controller; vehicles/network/recovery; detailed environment/lighting/streaming/tiered LOD; creature/NPC perception/navigation/state/animation; multiplayer/server validation/network load; procedural worlds/navigation/controlled variation; cinematic/audio/UI/accessibility.
- The separate flagship should follow concept research and audience testing. The existing Misprint Menagerie concept is a useful unpublished candidate, but its concept scores and audience remain hypotheses. Do not call it selected or audience-tested without participants.
- `scripts/build-all.ps1` and the project listing currently recognize top-level project directories. New standalone benchmark projects can be integrated without widening path access by placing each as a top-level child of `projects/`.
