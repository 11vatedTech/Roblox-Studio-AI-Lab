# AI Roblox Studio Lab completion ledger

Updated 2026-11-10. This ledger is a working handoff, not a release declaration. The machine-readable status, acceptance criteria, dependencies, defects, blockers, approvals, and evidence references remain in `lab-capability-register.json`.

## Repository checkpoint

- Branch: `codex/lab-recovery-p0`; the live playtest was captured against clean source checkpoint `2b6210c64120f94e87324b2bcd6d7f95d8d70a8c`. The evidence and this ledger are committed in the following handoff commit; use `git rev-parse HEAD` for that immutable record.
- Source snapshot at the live capture: 261 files, tree SHA-256 `ab61cdb600033d5c9a1b2a4f038afe230718851ddd7338765d5fb207e1ccdb3f` (clean), excluding `evidence/`.
- Verification: `npm test` passed 118/118; `npm run verify:evidence` passed 27/27 with 34 registered records.
- The live CLI exercised `studio.start_playtest` and `studio.stop_playtest` with two distinct single-use approvals, returned Studio to Edit, and wrote a token-free audit trail. Hosted CI for the handoff commit is run after the evidence commit.
- Current scope: **0 VERIFIED, 4 IMPLEMENTED, 14 IN_PROGRESS, 3 NOT_STARTED, 2 BLOCKED_EXTERNAL.** No independent reviewer is appointed; two-client, device, visual, release, and independent-review gates remain open.

## Independent reviewer

**Status: PENDING.** No reviewer identity has been supplied. The Lab cannot self-appoint one, and the author's local tests are not independent review. The required identity, separation, criterion coverage, and attestation fields are in `docs/quality/independent-review.md`. Until that gate is filled, no capability may move to `VERIFIED`.

## Latest reconciled observations

- The manual Signal Garden solo loop completed three times in one Play session. HUD captures at 13:10:43Z and 13:15:12Z show Restorations 1 and 3; all Echoes reset afterward; the console had no errors. Records: `evidence.studio.signal-garden-runtime-20261110` and `evidence.studio.signal-garden-completed-loop-20261110`.
- The live official Studio MCP inventory reports 36 tools with no missing schemas. The Lab now advertises exactly seven callable named read routes; 29 are blocked, including four Studio-read-only tools without a Lab route (`http_get`, `script_grep`, `script_search`, `skill`). Record: `evidence.studio.lab-live-studio-inventory-20261110`.
- The eight benchmark source projects exist and build, but none has source-bound scenario execution, target-device/visual evidence, or independent certification. The separate flagship is not audited or audience-tested.
- The fixed CLI exercised the reversible playtest gate end to end. Each operation was bound to project `signal-garden`, the clean source revision, Studio instance `d5f07df7-b8ce-4c9b-9e56-6891c6172a64`, and place `signal-garden-20261110T124445Z.rbxlx`; start returned Play and stop returned Edit. Record: `evidence.studio.lab-playtest-governance-20261110`. No save, sync, upload, or publish was invoked.
- Two-client, touch/controller, physical-device, art-direction, participant, and release gates remain external. The exact two-client/device protocol is in `docs/quality/multiplayer-device-gate.md`.

## Capability work queue

| ID | Status | Current evidence / implementation | Next executable gate | Blocker or approval |
|---|---|---|---|---|
| LAB-CORE-001 | IMPLEMENTED | Local lifecycle, occupied-port rejection, stale-PID recovery, failed-start cleanup | Attach source-bound lifecycle evidence and independent reviewer; exercise killed-process recovery with staged task output | Source-bound evidence and independent review remain |
| LAB-PROJECT-001 | IN_PROGRESS | Persistent manifest identity, bounded settings, revision conflicts, corruption classification, staging recovery, restart tests | Register source-bound evidence with independent reviewer | Specific approval before destructive project deletion |
| LAB-ROJO-001 | IN_PROGRESS | Three pinned local Rojo builds and source/output evidence | Verify executable digest, reproducibility, output tampering, concurrent builds, artifact confinement | Independent review remains |
| LAB-ROJO-002 | NOT_STARTED | Static builds only; Studio identity is known; no sync executor | Implement named loopback sync lifecycle bound to project, revision, Studio instance, and place | Only a playtest CLI exists; DataModel-changing sync needs target-specific approval and audit evidence |
| LAB-STUDIO-001 | IMPLEMENTED | Live 36-tool comparison: 7 callable, 29 blocked, 0 missing schemas; targeted 6/6 | Test disconnect/reconnect and Studio-upgrade schema changes; independent review | Dashboard remains read-only; the fixed CLI is the only mutation surface |
| LAB-STUDIO-002 | IN_PROGRESS | Five risk classes, closed catalog, 12 adversarial tests; live start/stop passed with two single-use approvals and token-free audit | Rojo sync, destructive/upload/publish executors, independent review | Only reversible playtest is live; sync/save/upload/publish remain blocked |
| LAB-EVIDENCE-001 | IN_PROGRESS | Typed records, SHA-256 references, source snapshots, criterion gates, 27/27 checks | Add independently attributable review, stale-evidence reporting, capability traceability | No independent reviewer identity |
| LAB-INTEL-001 | IN_PROGRESS | Versioned knowledge records and official API references | Expand provenance-backed coverage for networking, security, animation, UI, mobile, audio/VFX, persistence, release | Coverage incomplete |
| LAB-INTEL-002 | IN_PROGRESS | Open taxonomy/reasoning foundations | Run coverage report and held-out hybrid composition exercise | LAB-INTEL-001 coverage incomplete |
| LAB-ORCH-001 | IMPLEMENTED | Role matching, plans, artifact contracts, handoff tests | Demonstrate plan-to-reviewed-artifact workflow on a non-fixture project | Independent review remains |
| LAB-ORCH-002 | IN_PROGRESS | Test-only distinct MCP process/session handoff | Connect a supported real AI host; bind author/reviewer identity to attributable surfaces | Real client identity not authenticated |
| LAB-ASSET-001 | IN_PROGRESS | SignalBloom editable Blender source and reproducible geometry/material signature | Build offline asset-factory record; verify original asset in clean Studio build without upload; human review | Human asset/rights review; no upload authorized |
| LAB-ART-001 | IN_PROGRESS | Local gameplay captures; current scene is a dark stylized blockout | Final visual grammar, hero assets, animation review, target-resolution captures | Human art-direction approval |
| LAB-GAME-001 | IN_PROGRESS | Runtime scene, support geometry, clean console, source-bound capture, solo loop completed three times | Two-client replication, failure/recovery, touch/controller, new-genre brief-to-playable run, independent review | Two-client, device, visual, and independent-review gates remain; only reversible playtest is authorized |
| LAB-QA-001 | IN_PROGRESS | 118 Node tests, Luau syntax parse, 11 Rojo builds, 27/27 evidence checks, source-bound runtime observations | Engine-dependent Studio runner, Luau analysis, separate runtime/device/visual grades | Engine harness and physical-device grades remain |
| LAB-QA-002 | BLOCKED_EXTERNAL | Solo loop complete; historical two-client scenario is narrow | Two-client abuse/replication run, touch/controller, representative midrange phone | No confirmed device; native multi-client UI approval timed out |
| LAB-PERF-001 | BLOCKED_EXTERNAL | Desktop Studio development baseline only | 10–15 minute midrange-device profile: frame time, memory, load, network, thermal, quality tiers | No representative physical device |
| LAB-SEC-001 | IN_PROGRESS | Local API and server-authority tests | Independent adversarial boundary review; multiplayer abuse certification | No independent security review; multiplayer gate open |
| LAB-PRODUCT-001 | NOT_STARTED | No participant research or live-ops measurement claimed | Audience hypotheses, consent, privacy/retention, support, economy ethics, small disconfirming playtest | Human approval and real participants required |
| LAB-BENCH-001 | IN_PROGRESS | Eight benchmark source projects exist and build; flagship source exists | Source-bound scenario execution, device/visual grades, clean-checkout reproduction, audience-tested flagship | Human visual approval and participant evidence required |
| LAB-CI-001 | IMPLEMENTED | Hosted Windows CI passed on the preceding code commit; package/artifact steps pass | Independent review; record the handoff-commit CI run in the release dossier | Hosted CI is not Studio/device certification |
| LAB-RECOVERY-001 | IN_PROGRESS | Fresh archive, hash-verified restore, traversal/tamper rejection, package extraction | Interruption, content-level secret screening, independent restore, separate-device copy | No off-device target authorized |
| LAB-RELEASE-001 | NOT_STARTED | No release candidate claimed | Assemble unpublished dossier after gameplay, rights, device, security, performance, and review gates | All upstream gates and human approvals; publishing unauthorized |

## Exact commands and evidence

- `npm test` — 118/118 Node tests (includes the Studio read allowlist and fixed mutation boundary).
- `node scripts/studio-playtest.mjs --help` — fixed CLI surface.
- `npm run verify:evidence` — 27/27 checks, 34 registered records; report `evidence/p0/lab-evidence-registry-verification-20261110T183058577Z.json`.
- Live inventory: `GET http://127.0.0.1:4177/api/studio` after reconnecting the official Studio MCP.
- `npm run studio:playtest -- --action start ...` and `--action stop ...` — two distinct approvals; start result Game Started / state Play; stop result Game Stopped / state Edit; audit digest `bd782e799b13cb1c3afef09cf74f4895ce76baa8d4c99df268be3f54a9d3ca87`.
- `scripts/test-all.ps1` — passed on 2026-11-10: 118 Node tests, Luau syntax parsing, and 11 Rojo builds (base template, eight benchmarks, Misprint Menagerie, Signal Garden).
- Local Studio: `d5f07df7-b8ce-4c9b-9e56-6891c6172a64` (Signal Garden) and empty instance `7728ef66-4a93-452f-99be-c528aa2851a7`; PlaceId 0, GameId 0, local file only. No save, upload, or publish occurred.
- Remaining production work: Rojo live sync, destructive/save/upload/publish executors, asset/game/test pipeline, adversarial security review, benchmark scenario execution, and the separate flagship. Two-client/device, art-direction, participant, and independent-review gates remain external. This is not a completion declaration.
