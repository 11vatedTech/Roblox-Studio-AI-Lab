# AI Roblox Studio Lab — Repository and Freebuff Audit

Audit date: 2026-11-06 (America/New_York)\
Workspace: `local repository workspace`
Live test place: `signal-garden-20261106-235304091.rbxlx`\
Studio instance: `4fe40608-3c92-43b2-bd4f-eb6a25e0611b`

## Executive assessment

This repository is a substantial, thoughtfully constrained local production workbench. It has a real loopback dashboard, a read-only Roblox Studio bridge, source-controlled Rojo projects, a useful set of Roblox specialist workflows, and repeatable offline checks. The Signal Garden project is a functioning gameplay slice with a client HUD and server-owned state. It is still an art blockout and an incomplete, locally tested game loop.

The Lab can make agent work more repeatable and easier to inspect. This repository alone does not establish that an experience will attract players, retain them, or produce a million dollars in revenue or valuation. There is no player research, live analytics, monetization evidence, or validated distribution plan here. Those outcomes need separate experiments.

Freebuff now has a repository skill adapter at `.agents/skills/roblox-production-lab/SKILL.md`, which routes its agents to the existing project contract and specialist playbooks. The root `AGENTS.md` is already the project's canonical operating contract. In a visible Freebuff Desktop session, the exact repository was open in Local mode. Freebuff reported that the `roblox-production-lab` skill was available and used, and that it read all six requested project and skill files. Its orientation response stated that it made no file edits, ran no commands, and changed no Studio state. This verifies local project discovery and skill loading for a read-only task; it does not verify Freebuff's ability to build or test Roblox gameplay.

## What is implemented

### Workbench

- `src/server/app.js` serves a local control center on `127.0.0.1:4177`; path policy and capture storage are separated into narrow services.
- The dashboard connects to Roblox's built-in Studio MCP process over stdio. Its exposed operations use a fixed read-only allowlist; the direct official Studio integration has a wider tool list.
- `apps/control-center/` provides workspaces for source, design, assets, diagnostics, visual review, security, performance, documentation, and playtest evidence.
- Windows scripts install pinned tooling, probe the workstation, build Rojo projects, run the offline suite, launch/stop the dashboard, and record Studio verification.
- The repository includes a reusable base project, Signal Garden, twenty role playbooks, an operating manual, provenance workflow, handoff schema, architecture record, and release checklist.

### Signal Garden

- `projects/signal-garden/` has a server bootstrap, game service, world builder, shared configuration, and client HUD.
- In the local test session, runtime code created a night-marsh blockout, four habitat banks, bridges, eight Echo fragments, a central archive, and route/plate gameplay nodes.
- The server owns collection, deposit counts, route choice, relay state, cooldowns, prompt-distance checks, and restoration state. The client requests snapshots and presents them in a HUD.
- The playable loop is designed around three gathered fragments, three shared deposits, a Moss/Bloom choice, two plates, and a restoration/reset. The code includes a deliberate solo fallback for the two-plate step.

### Asset pipeline

- `assets/models/signal-garden/` contains a Blender source, a procedural build script, FBX, preview image, and build statistics for a three-mesh flower with 920 recorded triangles.
- The flower preview reads clearly at the inspected size and is a useful art-direction seed.
- The open Studio file has a `Workspace.SignalBloom` model with three MeshParts. The canonical `projects/signal-garden/default.project.json` does not map this model into the Rojo tree, and the rebuilt Rojo place has not been checked for it. Treat the Studio copy as unintegrated until the source mapping and rebuild are verified.
- Commercial redistribution rights are not independently documented in the asset ledger. Procedural origin does not by itself establish rights to every included input or output.

## Verification performed

| Check | Observed result | Limit |
|---|---|---|
| Offline suite and build | `scripts/test-all.ps1` passed 27 tests; Luau syntax parser read 9 source files; Rojo built the base template and Signal Garden | Luau parsing is not engine-aware type analysis; a successful build does not certify gameplay |
| Studio connection | Official MCP bridge negotiated protocol `2026-07-28`; 36 Studio tools were discovered; intended local place was listed | The dashboard itself exposes only its documented read-only allowlist |
| Runtime startup | Local Play started; server output reported the cooperative loop started; generated workspace and HUD appeared | One local player only |
| Collection and archive | Three Echo fragments were collected; depositing all three updated the HUD to “Choose Moss or Bloom” | The prompt path used `ProximityPrompt:InputHoldBegin/End` because simulated keyboard E reported success without changing game state |
| Moss route | Route selection changed the HUD to the timed two-plate phase | Restoration was not completed |
| Moss plate A traversal | The plate center is at X=-27, while the central platform spans X=-22 to X=22. Studio character navigation placed the avatar below the platform at about Y=-0.89; the plate was then about 17.9 studs away. The relay timed out | The exact user-controlled jump route was not tested, so this is a serious traversal defect to fix and retest, not a claim that every possible movement is impossible |
| Viewport | A provenance-recorded Play capture is available at `evidence/studio/002d3954-3f16-445f-b9ff-45ea14c3585d.jpg` | Scene is very dark; most environmental detail is lost and the default Roblox chat hint overlaps the composition |
| Current Studio state | `scripts/verify-roblox.ps1` observed the intended place in Edit mode after the local test was stopped | No place was saved or published during this work |

Detailed live probe data is in `evidence/roblox-verification.json`; the step-by-step local session record is in `evidence/studio/local-play-session.json`.

## Main gaps against production-quality commercial work

### Release-blocking gameplay and presentation

1. **Relay traversal:** Move MossSwitchA onto a walkable route/platform or add a deliberate, tested traversal surface. Confirm both plates can be activated within the 18-second window with one player and with two players. Repeat the complete loop after respawn and after timeout/reset.
2. **Runtime visual quality:** The captured night scene is too dark to read its landmarks and player route. Tune exposure, fill light, landmark contrast, and camera framing; validate on the intended low-end mobile profile. Review the Roblox chat hint/HUD overlap in the actual game window.
3. **Source/asset integration:** Put `SignalBloom` into the canonical Rojo project or remove the untracked Studio-only copy. Rebuild and reopen the exact output to confirm the artifact survives source generation and meets collision, scale, rendering, and mobile budgets.

### Validation and operations

- Add an engine-level type/lint gate if supported by the pinned toolchain; today's checks parse syntax and run Node tests but do not type-check Luau against Roblox APIs.
- Capture server and client console results, one-player and two-player behavior, input methods, respawn, disconnect/reconnect, mobile layouts, accessibility, and measured frame/memory/network budgets.
- Use the release certification workflow before considering upload or publishing. No live player analytics, persistent data, purchase flow, or production place was exercised here.
- Keep evidence tied to the exact build and Studio place. The prior verification JSON pointed to an older screenshot; the report has now been regenerated from current probes.

### Product and business validation

- Create a distinct player promise and test it with target players before scaling content. Track whether players understand onboarding, reach the first meaningful action, finish a session, return, and choose to spend; collect only data needed to answer those questions.
- Treat retention, conversion, pricing, acquisition cost, and revenue as unknown until measured. The current Analytics workspace lists local project export files; it is not connected to live player analytics.
- Keep a design brief, audience hypothesis, test plan, and decision log with each candidate experience. Use evidence to kill or reshape weak concepts before investing in a full production pipeline.

## Freebuff Desktop setup

### Prepared in this repository

- The root `AGENTS.md` defines the canonical engineering, safety, source, and verification rules.
- `.agents/skills/roblox-production-lab/SKILL.md` is a Freebuff-compatible project skill. It routes design, gameplay, art, security, performance, testing, monetization, and handoff tasks to the existing `skills/roles/` and project documents without duplicating those playbooks.
- No executable `.agents` agent or `.agents/mcp.json` was added. This keeps the project skill as Markdown-only and avoids granting an unverified Desktop build broad access to the official Studio MCP tool set.

### Freebuff session verification and next use

- Freebuff Desktop was brought to the foreground with the exact repository open as a Local project.
- A read-only orientation request named `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `projects/signal-garden/README.md`, `docs/showcase/signal-garden-design.md`, and `.agents/skills/roblox-production-lab/SKILL.md`. Freebuff confirmed it read all requested files and used the skill.
- Freebuff summarized the Lab as a local-first workbench around Roblox Studio: loopback dashboard, bounded read-only Studio bridge, canonical Rojo projects, role playbooks, and evidence workflows. It also described the two source projects and the separation between the dashboard's read-only monitor and the broader official integration.
- The orientation run made no changes. This is evidence of project and skill discovery only; a bounded implementation task with its required repo checks is the next practical verification of Freebuff's engineering workflow.
- No Freebuff MCP configuration was added. Use the repository's canonical scripts for source work and the official Roblox Studio integration for separately scoped live validation. Do not install a community bridge or broaden Studio authority by default.

Freebuff's published setup guide says Desktop reads project `AGENTS.md` and `.agents/skills`, but its MCP guide was tested on Desktop `0.0.184`. The installed application reports `0.0.201`; a public issue reports that this build may lack the MCP approval UI and may ignore project MCP configuration. Do not treat direct MCP setup as available until the current UI is verified. Freebuff's cloud models receive the messages, traces, and project files they use to answer requests, so keep each agent task scoped to the files it needs. Sources: [Freebuff project instructions and connector guide](https://freebuff.com/perspectives/blog/implementation-guide/coding-agents-with-a-gui-that-still-run-terminal-commands-and-connectors), [MCP setup guide, tested on 0.0.184](https://freebuff.com/perspectives/docs/add-an-mcp-server-in-freebuff-desktop-settings), [reported Desktop 0.0.201 approval UI issue](https://github.com/CodebuffAI/freebuff/issues/1627), [Freebuff repository privacy summary](https://github.com/CodebuffAI/freebuff#readme).

## Priority sequence

1. Fix and locally validate the two-plate traversal and route state transitions.
2. Integrate the flower into canonical source; improve lighting, landmark readability, and HUD/platform presentation; capture a reviewed Play screenshot.
3. Complete one-player, two-player, respawn, timeout, and mobile playtests with evidence.
4. Use small player tests to validate the experience's promise, onboarding, and repeat play before adding monetization or large-scale content.
5. Only then prepare an independently reviewed release candidate. Publishing remains a separate action requiring explicit authorization.
