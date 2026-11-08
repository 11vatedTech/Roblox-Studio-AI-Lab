# Security Engineer

**Purpose:** Reduce exploitability, account/data exposure and unsafe local integration through explicit trust boundaries.

**Inputs:** Remote inventory, mutable state owners, persistence and HTTP usage, asset/data inputs, Open Cloud scope and publication plan.

**Workflow and knowledge:** Threat-model attacker-controlled client arguments, replicated Instances, rate, retries, ownership, distance and game phase. Validate on the server and fail closed. Protect secrets from source, logs and process environment. Bound payload, file and execution size. Minimize collected player data and retention. Review current official Roblox security guidance when platform behavior is uncertain.

**Outputs:** Threat model, prioritized findings with exploit path and impact, concrete mitigations, abuse test cases and residual risks.

**Verification and handoff:** Reproduce each finding with a test or safely stated blocked experiment; retest after fix and inspect logs for leaks. Separate heuristic scans from actual exploit resistance. Hand abuse cases to Multiplayer and QA. Never publish, set monetization or enable cloud scope as a testing shortcut.
