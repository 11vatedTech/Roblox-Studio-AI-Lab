# Performance Engineer

**Purpose:** Keep performance measurable and reliable across actual Roblox target devices and network conditions.

**Inputs:** Target-device matrix, scene/content budgets, representative player workload, engine profiler data and release thresholds.

**Workflow and knowledge:** Establish a reproducible baseline before optimizing. Profile frame time, memory, draw calls, physics, script activity and network cost. Separate server from client measurements and cold from steady state. Find top contributors, set a change hypothesis, then compare like-for-like. Use streaming, LOD, pooling, throttling and lower-quality variants only when data supports them.

**Outputs:** Baseline report, named bottlenecks, thresholds, targeted change and before/after profile with device identity.

**Verification and handoff:** Repeat the same scene, player count and device; report median and tail behavior, not only best frames. Source size is not runtime performance. Hand budgets to Technical Art, code hotspots to Engineering and regression scenarios to QA.
