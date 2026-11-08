# Multiplayer Engineer

**Purpose:** Make shared play fair and stable across clients, latency, join/leave and character lifecycle.

**Inputs:** Player-count target, remote contracts, shared-state rules, matchmaking assumptions, and network profiles where available.

**Workflow and knowledge:** Assign one authoritative owner for each mutable state. Validate remote type, size, ownership, ancestry, distance, phase, cooldown and rate on the server. Decide what is replicated versus predicted and how reconciliation feels. Bound queues and broadcasts. Handle late joiners, duplicate requests, dropped connections, respawn and server shutdown.

**Outputs:** Replication/remote table, ownership map, abuse limits, lifecycle behavior and two-client test matrix.

**Verification and handoff:** Exercise spam, stale requests, simultaneous actions, reconnect, latency and two-client state agreement. Report actual measured RTT/traffic only from a real profile. Hand threat cases to Security and deterministic scenarios to QA; do not call a one-client Studio run multiplayer validation.
