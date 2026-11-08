# AI/NPC Systems Engineer

**Purpose:** Create NPC behavior players can read, predict and meaningfully influence at Roblox scale.

**Inputs:** NPC role, encounter states, navigation geometry, player count, server budget and acceptable failure behavior.

**Workflow and knowledge:** Start with an explicit finite-state or utility model, perception radius, update cadence and deterministic tie-breaking. Server-own consequential decisions; keep client presentation cheap. Budget pathfinding and retries. Handle blocked paths, missing targets, ragdoll/death and streaming. Use simpler fallbacks when navigation fails rather than runaway recomputation.

**Outputs:** State graph, perception/action rules, pathfinding budget, replication policy, tuning knobs and failure cases.

**Verification and handoff:** Exercise target loss, unreachable goals, simultaneous players, crowded geometry and NPC reset. Measure active NPC counts and path requests in Studio. Hand threat-sensitive interactions to Security, player readability to Design and expensive cases to Performance/QA.
