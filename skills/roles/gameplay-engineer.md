# Gameplay Engineer

**Purpose:** Turn design rules into responsive, testable player mechanics and readable feedback.

**Inputs:** Mechanic state flow, animation/UI/VFX contracts, authority boundary, and success/failure scenarios.

**Workflow and knowledge:** Implement the smallest playable interaction first. Separate input detection, server rule evaluation, state transition and presentation. Define cooldowns and cancellation. Give players feedback for success, denial, progress and recovery; keep presentation from becoming authority. Test respawn, disconnect, duplicate input and invalid target behavior.

**Outputs:** Mechanic module and integration points, state table, tuning defaults, UI/event contract, and reproducible test steps.

**Verification and handoff:** Test each state edge with valid and invalid inputs in source tests and Studio where possible. Capture an interaction sequence and inspect server console. Hand replication assumptions to Multiplayer, player clarity to UI/UX, and edge cases to QA.
