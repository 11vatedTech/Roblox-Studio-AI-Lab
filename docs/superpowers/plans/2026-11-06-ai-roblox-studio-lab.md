# AI Roblox Studio Lab build and validation status

Status date: 2026-11-07 (America/New_York). Generated machine and Studio observations are stored under `evidence/`; current gate status is summarized in `2026-11-07-lab-recovery-and-p0-repairs.md`.

## Objective

Build a local-first, source-controlled production workbench that helps Codex, Freebuff, and its operator design, implement, inspect, validate, and iterate on Roblox experiences. The Lab uses Roblox Studio's official MCP server for live Studio reads when the operator enables it. It does not silently edit, upload, publish, or change account settings.

## Delivered

- Loopback-only browser control center with project, Studio, explorer, assets, agents, design, code, playtest, visual QA, performance, security, analytics, documentation, and diagnostics workspaces.
- Read-only local stdio bridge for the official Roblox Studio MCP server, with named operations and truthful connection state.
- Source-controlled Rojo starter and Signal Garden cooperative slice. The showcase contains server-authoritative collection/deposit, route choice, a timed two-plate relay, environment response, HUD, and reset loop.
- Twenty Roblox specialist playbooks, a shared operating manual, architecture and safety decisions, test and release workflows, Windows setup/build/diagnostic scripts, and persistent screenshot capture storage with provenance and integrity checks.
- Freebuff project skill at `.agents/skills/roblox-production-lab/SKILL.md`, routing agents to the same root contract and specialist playbooks.
- Original native Terrain and Part blockout for Signal Garden. Its provenance and art-stage boundary are recorded in `assets/asset-ledger.json`; it has no external asset dependency.

## Verified on this workstation

| Check | Result | Evidence |
|---|---|---|
| Node test suite | 31 tests passed on 2026-11-07 | `npm test`; captured output is in `evidence/p0/node-tests-2026-11-07.txt` |
| Path policy | Focused suite passed on Windows and POSIX (WSL), including symlink creation and traversal cases | `evidence/p0/path-policy-windows-2026-11-07.txt` and `evidence/p0/path-policy-posix-2026-11-07.txt` |
| Luau syntax parse | 35 source files parsed; engine-aware type analysis is not claimed | `scripts/lint-luau.ps1` |
| Rojo builds | Base template, Misprint Menagerie, and Signal Garden built with Rojo 7.7.1 | `evidence/build-report.json` |
| Environment probe | Studio, official launcher, Git, Node, Rojo, Luau, Blender, and Ollama detected | `evidence/environment-report.json` and `.md` |
| Historical Roblox Studio bridge | The earlier report captured protocol negotiation, 36 tools, a DataModel read, and console access in Edit mode | `evidence/roblox-verification.json` |
| Historical Roblox Studio local gameplay | One-player run verified three Echo collections, three archive deposits, and route choice; MossSwitchA traversal dropped the avatar below the platform and the relay timed out | `evidence/studio/local-play-session.json` |
| Viewport review | Play-mode screenshot saved with SHA-256 provenance; captured blockout is too dark for a production visual pass | `evidence/studio/002d3954-3f16-445f-b9ff-45ea14c3585d.jpg` and its metadata |
| Current Studio gate | The generated local build (PlaceId 0, GameId 0) completed both solo routes, timeout recovery, and reset, then returned to Edit without saving; two-client and device-input tests remain blocked | `evidence/studio/signal-garden-p0-run.json` and linked captures; desktop connector still denied UI access despite user approval |
| SignalBloom source reproduction | Two Blender 5.2.0 LTS builds matched the source `.blend` canonical model/material hash; output file hashes varied between runs | `assets/models/signal-garden/SignalBloom-build.json` |

## Remaining acceptance gates

- The source adds collidable, coplanar support pads under MossSwitchA and BloomSwitchB. Both solo routes completed collection → archive → route → two plates → restoration/reset in the generated local build. A real two-client run is still needed.
- E prompts and route behavior were exercised through single-player keyboard input. Controller/touch input, reconnect/respawn, mobile layout, accessibility, and measured performance profiles remain unverified.
- Improve the very dark runtime art and HUD/platform readability. The environment is still a stylized blockout, not finished art.
- `SignalBloom` is reproducible in Blender source but remains absent from the canonical Rojo map and the tested local build. No import or upload was attempted; a no-upload representation and rebuilt-place presence remain unverified.
- Freebuff's project skill has been prepared but not visibly loaded in its Desktop app yet. Desktop is installed as version `0.0.201`; verify current skill behavior after opening the repository. Do not assume the direct Studio MCP approval UI exists in this version.
- No player research, live analytics, monetization, acquisition data, or revenue evidence exists. Treat commercial value as an unvalidated hypothesis.
- Local model inference and the complete visual/mobile accessibility review have not been measured.

## Reproduction

```powershell
.\scripts\install.ps1
.\scripts\doctor.ps1
.\scripts\test-all.ps1
.\scripts\verify-roblox.ps1
.\scripts\start-lab.ps1
```

Generated builds are ignored under `.lab-runtime/builds/`. Do not treat a successful build as a substitute for the remaining live Studio acceptance gates.
