# Multiplayer and physical-device gate

## Status

**BLOCKED_EXTERNAL.** The current Signal Garden run is a single local desktop Studio Play session. It completed the solo loop three times, but it does not establish two-client replication, touch/controller behavior, or physical-device performance.

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

- Native Studio multi-client UI approval timed out in the earlier attempt.
- No confirmed physical midrange phone is available.
- The Lab has only a reversible start/stop playtest CLI; it can start a local play session but cannot drive the native two-client UI or synthesize a second player.
- No human independent reviewer is appointed; only an automated distinct-process review exists for the reversible playtest evidence.

A solo desktop pass must never be substituted for this gate.
