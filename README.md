# 11vatedTech AI Roblox Studio Lab

A local-first development workbench for building, inspecting, validating, and iterating on Roblox experiences. It is designed around the official Roblox Studio MCP server, a source-controlled Luau workflow, and honest evidence from the machine and Studio session.

## Current delivery boundary

This repository is the **AI Roblox Studio Lab**: a local-first platform for Roblox project authoring, bounded source validation, Studio inspection, and specialist task execution. It includes a loopback control center, a read-only bridge to Roblox's official Studio MCP, a fixed-purpose Lab Tasks MCP server, versioned game intelligence, registered specialist contracts, Rojo tooling, and Windows setup and recovery scripts. **Signal Garden is one showcase project inside the Lab; it is not the Lab product.** The Lab's complete acceptance register remains the source of truth for unfinished capabilities.

Earlier Studio evidence recorded the traversal defect: MossSwitchA was beyond the central platform and navigation dropped the avatar below it. The source now creates anchored, collidable support extensions under the two outer plates, MossSwitchA and BloomSwitchB. In a new Play run of the generated local build (`PlaceId=0`, `GameId=0`), both Moss and Bloom solo routes completed through held ProximityPrompt input, the relay timeout returned to route choice, and the restoration delay returned the HUD to the gather loop. The Studio runtime was stopped and returned to Edit without saving the place. The exact run and captures are in `evidence/studio/signal-garden-p0-run.json`. A real two-client run, touch/controller input, device profiles, and performance budgets remain unverified.

SignalBloom's Blender source rebuilds consistently at the normalized geometry/material level: two isolated Blender 5.2.0 LTS builds matched the source `.blend` signature across three meshes and 920 triangles. Blender artifact hashes vary between runs; source and run hashes are recorded in `assets/models/signal-garden/SignalBloom-build.json`. The opened generated Rojo build contained no SignalBloom model, and the canonical project still has no model mapping. No import was attempted and no asset was uploaded; a no-upload representation has not been proven to survive a clean build and Studio reopen.

## Requirements

- Windows 11 and Roblox Studio.
- Node.js 20 or newer and Git.
- Rojo 7.7.1 for source synchronization. `scripts/install.ps1` installs the pinned official Windows binary into ignored `.tools/` and checks its published SHA-256 digest. It does not modify PATH or install the Studio plugin.
- A Roblox account and a place opened in Studio for the live MCP workflow. Sign-in and Studio's MCP switch remain user-controlled.

No paid API, API key, cloud dashboard, or external service is required for the local control center.

## Start the Lab

From PowerShell in the repository:

```powershell
.\scripts\install.ps1
.\scripts\doctor.ps1
.\scripts\start-lab.ps1
```

The dashboard listens only on `http://127.0.0.1:4177`. Use `.\scripts\stop-lab.ps1` to stop the process started by the Lab. The CLI alternative is `npm start`.

## Connect Roblox Studio

1. Open Roblox Studio and a local or unpublished test place.
2. Open Assistant → Settings → MCP Servers (older builds may show Manage MCP Servers) and enable **Studio as MCP server**.
3. Enable **Quick Connect → ChatGPT (codex)** in Studio when using the official Codex editing and playtest tools. Roblox's current instructions say to restart the client if tools do not appear.
4. In the Lab dashboard, open **Roblox Studio** and select **Connect official MCP**. The monitor confirms the link only after `list_roblox_studios` returns a real Studio instance.
5. The Lab monitor inventories the connected server's actual tool names and bounded input schemas. Only explicit read-only routes are callable; newly discovered tools remain unclassified and blocked. The official Codex plugin exposes Studio's wider tool set, including edit and play controls. Save a place version before substantial Studio edits and keep the Rojo project source as the repository's canonical copy.

The Lab monitor only exposes named read operations. It does not expose arbitrary Luau, script edits, asset uploads, publishing, Open Cloud settings, or player-data writes.

## Source workflow

The reusable template is at `roblox/templates/base/`; the separately named showcase project is at `projects/signal-garden/` (its display name is **AI Roblox Studio Lab — Showcase Experience**). Build local place files without publishing:

```powershell
.\scripts\build-all.ps1
```

Generated `.rbxlx` files are placed under `.lab-runtime\builds\`; the latest outputs and sizes are recorded in `evidence\build-report.json`.

The Rojo Studio plugin is a separate Studio-side requirement for live source synchronization. The showcase README describes the cooperative loop and its current art and validation boundary.

The Projects workbench can inspect a project's `default.project.json` and build an unpublished `.rbxlx` using the pinned Rojo 7.7.1 CLI. Each project also carries a persistent `lab.project.json` identity with bounded settings and a revision: `GET /api/projects/<slug>` reports integrity, corruption, incompatibility, and interrupted-operation state; `PATCH` updates settings with revision conflict detection; and `POST /api/projects/<slug>/recover` removes stale staging output or rebuilds an unreadable manifest while preserving the original bytes. The Lab validates all declared `$path` inputs, copies them into a bounded snapshot, hashes the snapshot and output, and stores the artifact and operation record under ignored `.lab-runtime/`. Use `GET /api/projects/<slug>/rojo` to inspect configuration and recent build state, `POST /api/projects/<slug>/build` with `{}` to run the named build operation, and `GET /api/builds/<id>` to download a successful artifact. It does not start live sync or alter an open Studio place.

## Build a game on LabKit

Create a project from the production template (Workbench, or `POST /api/projects` with `{ "name": "my-game", "template": "production" }`). The project gets a vendored, hash-locked LabKit in `Packages/LabKit` and a working loop: server-validated collection, session-locked persistence, an upgrade shop with refund-safe purchases, AnalyticsService economy events, idempotent developer-product receipts (off until product IDs are configured), and a touch-ready themed HUD. Replace the orb loop with your design and keep the infrastructure. See `roblox/packages/labkit/README.md` and `roblox/templates/production/README.md`; `scripts/test-all.ps1` runs every LabKit and template spec with the pinned Luau and builds both with Rojo.

## Plan and hand off project work

The Agent Workbench creates versioned task plans under each project at `.lab/task-plans/`. It matches the requested capabilities and artifact types to registered specialists and a compatible reviewer, snapshots selected knowledge, and preserves exact read/write ownership paths.

After a human approves a task, a connected AI client can claim it through the Lab Tasks MCP server. Owners stage project files under `.lab/task-executions/`; the independent reviewer must use a separate MCP server process and session. Rejection returns the task for correction. Acceptance verifies source hashes, integrates staged outputs, and writes process-attributed review evidence. Luau code changes require the reviewer to run the pinned Luau parser, the project's Roblox-free Luau CLI specs, and a Rojo build against a temporary copy with staged outputs applied. Studio runtime behavior remains a separate gate.

Connect a stdio MCP client using the instructions in [Lab specialist execution](docs/workflows/lab-task-execution.md), or launch the server with `npm run mcp:tasks`. The task server exposes fixed task operations only; it does not launch model providers or expose arbitrary shell, file, or MCP access. Reviewer evidence records actual server process and session IDs while clearly limiting client name/version to self-reported metadata.

The local API exposes `GET /api/specialists`, `POST /api/task-plans`, `GET /api/task-plans?project=<slug>`, `GET /api/task-plans/<plan-id>`, `GET /api/task-plans/<plan-id>/tasks/<task-id>/handoff`, and `PATCH /api/task-plans/<plan-id>/tasks/<task-id>`. Direct API status updates cannot mark tasks passed or submit work for review; those transitions run through the MCP execution workflow.

The Control Room and `GET /api/capabilities` read the validated machine-readable acceptance register in `docs/quality/lab-capability-register.json`. Each requirement has dependencies, implementation paths, acceptance criteria, verification method, status, evidence references, defects, blockers, and approvals. `VERIFIED` requires passing evidence; blocked and deferred rows require a specific reason. The register currently marks the Lab as incomplete.

The typed evidence index at `evidence/registry.json` is validated against its referenced source records. `GET /api/evidence` exposes scoped outcomes and SHA-256 reference checks; the Control Room overview links to the same registry. A passed local multiplayer scenario remains one narrow result, not a multiplayer certification. The 2026-11-10 gate probe is explicitly blocked: the live MCP surface observed one Server and one Client and exposes no multi-client operation, and the Device Simulator probe is not a physical-device result.

## Quality commands

```powershell
npm test
npm run verify:task-execution
npm run verify:evidence
.\scripts\test-all.ps1
.\scripts\verify-roblox.ps1
```

`npm test` exercises the local server, path guards, storage, specialist/task workflows, backup compatibility, and both legacy and current MCP protocol behavior. On Windows it also runs the Roblox-free Luau CLI specs using pinned Luau 0.745. `npm run verify:task-execution` records the test-only two-process MCP workflow; `npm run verify:evidence` records the typed evidence API checks. `scripts/test-all.ps1` adds Luau syntax parsing and all declared Rojo builds. Engine-dependent `.spec.luau` files, Studio behavior, devices, multiplayer, and visual quality remain separate gates.

The current validation record is `evidence/p0/lab-platform-verification-2026-11-07.json`; it records exact commands, tool versions, output hashes, and the remaining Studio/device boundary. The machine-readable Lab acceptance register at `docs/quality/lab-capability-register.json` remains the source of truth for incomplete platform capabilities.

## Repository map

- `apps/control-center/` — browser dashboard.
- `src/` — loopback HTTP service, bounded Roblox Studio MCP client, Lab Tasks MCP server, staged task execution/review, quality checks, knowledge records, specialist matching, and project-scoped task plans.
- `roblox/packages/labkit/` — LabKit, the production Luau framework (validated remotes, session-locked saves, receipts, economy, inventory, state machines, seeded RNG, loot odds/pity, springs, UI theme) with Roblox-free specs.
- `roblox/templates/` — Rojo project templates: `production` (LabKit game loop with persistence, economy, shop, analytics, themed HUD) and `base` (minimal workflow check).
- `projects/` — local experiences created from templates; the Signal Garden showcase currently runs as a stylized blockout.
- `skills/` — specialized Roblox production workflows.
- `.agents/skills/` — Freebuff-compatible entry skill that routes agents into this project's operating contract and playbooks.
- `scripts/` — Windows setup, diagnostics, start/stop, validation, build, and backup.
- `docs/` — architecture, operations, quality, design records, and the machine-readable game-intelligence registry.
- `assets/` — local assets and their provenance ledger.
- `evidence/` — generated machine and Studio verification reports.

## Product status

This is a staged product build, not a claim that every item in the attached mission has been completed. The current repo and Freebuff audit is in `docs/reviews/2026-11-06-repository-and-freebuff-audit.md`; the active roadmap and evidence gates live in `docs/superpowers/plans/2026-11-06-ai-roblox-studio-lab.md`; architectural tradeoffs are in `docs/architecture/`.
