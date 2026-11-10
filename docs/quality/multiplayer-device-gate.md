# Multiplayer and physical-device gate

## Status

**BLOCKED_EXTERNAL.** The 2026-11-10 fixed gate probe drove one local Studio Play session on disposable `lab-empty.rbxlx`. It observed exactly one Server player and one Client player, then stopped back to Edit. The live 36-tool MCP surface exposes no player-count, start-server, or additional-client operation, so this is not a two-client run. The same probe selected the Studio Device Simulator phone `samsung_galaxy_s25_ultra` at `685x338`, captured the viewport, and reset to the desktop device; it did not use a physical phone or measure device performance.

## 2026-11-10 probe result

- Command: `npm run studio:gates -- --studio bacee940-85ac-4899-ba05-a4f923b1d479` at clean source `6fbaac0`.
- Multiplayer: Server count 1, Client count 1, both `11vated_indieGames`; `start_stop_play` arguments `[is_start, studio_id]`; no multi-client operation in 36 tools; stopped to Edit. Record: `evidence.studio.lab-multiplayer-gate-probe-20261110` (blocked, canonical SHA-256 `1be3c790…`).
- Device: selected `samsung_galaxy_s25_ultra`, viewport `685x338`, capture `7aa2283c-392c-4bb8-a5ba-58a95cd31c0c` (48,339 bytes, SHA-256 `c95c1157…`), reset to `810x634`. Record: `evidence.studio.lab-device-emulator-probe-20261110` (blocked, canonical SHA-256 `9f7c5336…`).
- No save, upload, publish, Open Cloud call, or real-project mutation was performed.

## Prerequisites

- The exact unpublished place and Studio instance are identified.
- The source commit and source-tree digest match the build under test.
- Two real Studio clients are available in the same server session.
- The native Studio multi-client UI is approved by the workstation operator.
- A representative midrange physical phone is available for touch and performance checks.
- No save, upload, publish, asset purchase, or production-data change is implied.

## Two-client scenario

1. Start one server with two clients in the same unpublished place.
2. Have Player A collect an Echo and verify the server-owned state and Player B's replicated view.
3. Have both players attempt a deposit and a route choice; verify one authoritative outcome and no duplicate restoration.
4. Exercise malformed, unauthorized, out-of-range, stale-state, and rate-abusive requests; the server must reject them without corrupting state.
5. Disconnect and reconnect one client; verify state agreement and recovery.
6. Record the HUD, console, DataModel state, client identities, and Studio instance/place for each step.

## Device scenario

- Use a named midrange phone, not a desktop or Studio emulator.
- Exercise touch and controller input, safe areas, core UI/chat clearance, and the same solo loop.
- Capture at target resolution.
- Profile for 10–15 minutes: frame time, memory, load time, network behavior, thermal state, and quality tiers.
- Compare against recorded budgets; do not infer device performance from the desktop Studio sample.

## Required evidence

- `studio-session` record with three distinct session IDs, two player interactions, a replicated-counter check, and no-save closure for multiplayer.
- `performance-profile` record with device identity, settings, source digest, measured values, and thermal session.
- `visual-review` record with target-tier captures and a reviewer decision.
- Independent review for every capability claimed from the run.

## Current blockers

- `STUDIO_MULTI_CLIENT_SURFACE_ABSENT`: the live MCP `start_stop_play` schema accepts only `is_start` and `studio_id`; there is no player-count, start-server, or additional-client operation. The native Studio Clients and Servers UI must be driven by a human or another supported multi-client runner.
- `PHYSICAL_MIDRANGE_DEVICE_UNAVAILABLE`: no confirmed physical midrange phone is available. Studio Device Simulator selection and a viewport capture are emulator-only; they are not touch, thermal, or performance certification.
- The Lab has only a reversible start/stop playtest CLI and the fixed device-simulator probe; it cannot synthesize a second player or substitute for a physical phone.
- No human independent reviewer is appointed; only an automated distinct-process review exists for the earlier reversible playtest evidence, and it does not cover these gate records.

A solo desktop pass must never be substituted for this gate.
