# Performance verification plan

This plan separates desktop development measurements from target-device certification. It follows the Roblox Creator Hub guidance to measure frame time, memory, and load time with client-side tools; Studio statistics are development evidence and can be skewed by Studio overhead.

## Current development baseline

Project: Signal Garden local generated build `signal-garden-20261107-175946294.rbxlx` (PlaceId 0, GameId 0). Workstation: Windows 11 Home, Intel Core Ultra 9 275HX, NVIDIA GeForce RTX 5070 Ti Laptop GPU (12,227 MiB reported), 31.4 GiB RAM. Studio 0.746.0.7461269. This is a high-end laptop and is not a substitute for a midrange phone.

One local Studio Play sample collected 300 client `RenderStepped` intervals after the world initialized:

| Metric | Result |
|---|---:|
| Sample count | 300 |
| Sample duration | 4.999 s |
| Mean frame interval | 16.667 ms |
| Median frame interval | 16.656 ms |
| p95 frame interval | 17.920 ms |
| Maximum frame interval | 18.603 ms |
| Median-equivalent rate | 60.04 FPS |
| Client-reported total memory | 1,711.73 MiB |
| Instance count | 54,289 |
| Scene draw calls | 44 |
| Scene triangles | 28,137 |

These are a single local Studio development sample, not a benchmark, and no CPU/GPU bottleneck conclusion is inferred from them. The scene is an early dark blockout and has not had final assets integrated.

## Measurement procedure

1. Record repository commit and dirty source snapshot, project manifest, Studio version, place/game IDs, device model/OS, display resolution, graphics quality, and session mode.
2. Run separate scenarios for cold start, idle world, representative traversal, collection, full route restoration, simultaneous player actions, and a 10–15 minute sustained mobile session.
3. On the client, sample `RunService.RenderStepped` intervals and report count, mean, median, p95, maximum, and seconds of measurement. Record `Stats:GetTotalMemoryUsageMb()`, instance count, scene draw calls, and scene triangles. Keep client and server results separate.
4. Use Developer Console for memory/network/script diagnostics and MicroProfiler for frame-level CPU/GPU task breakdowns. Record frame dumps or screenshots when a spike or regression is observed.
5. Repeat the same scenario and settings after each material asset or gameplay change. Keep raw output and its SHA-256 beside the summary.
6. Do not treat the Studio application frame rate as a physical-client result. Device acceptance requires a real representative phone, a sustained session, touch/controller interaction, and device-side memory/frame captures.

## Provisional engineering targets

- High tier: median client frame time at or below 16.67 ms (60 FPS target) and p95 at or below 16.67 ms in the representative play loop.
- Midrange mobile floor: median and p95 at or below 33.33 ms (30 FPS floor) during ordinary traversal and interaction, with no sustained degradation during the 10–15 minute session.
- Server heartbeat: target the 16.67 ms frame budget for ordinary gameplay; investigate recurring overruns and use MicroProfiler/Developer Console evidence to locate the cause.
- Memory and network budgets remain device- and design-specific until a representative phone and expected player-count target are declared. Record the exact device and compare measured usage to its available resources rather than substituting a desktop result.

These thresholds are proposed acceptance targets, not measured certification. Adjust them only with the product owner and record the reason. A phone, controller/touch coverage, and device-side captures are still required to close LAB-PERF-001 and the device portion of LAB-QA-002.

## Required remaining device evidence

- Physical device model, OS, screen resolution, and available memory.
- Touch controls, UI readability, and a full Signal Garden route loop on-device.
- 10–15 minutes active play with frame-time, memory, heat/thermal behavior, and network observations.
- Raw capture files plus a source-bound report and a second reviewer.

## Official references

- [Roblox Stats service](https://create.roblox.com/docs/reference/engine/classes/Stats) for read-only performance counters and total session memory.
- [Identify performance issues](https://create.roblox.com/docs/performance-optimization/identify) for client/server diagnostics, the 60 FPS / 16.67 ms reference, Studio measurement limitations, and frame-time/memory/load-time categories.
- [Test on hardware](https://create.roblox.com/docs/performance-optimization/test-on-hardware) for real-device profiling, thermal sessions, touch targets, and device-specific verification.

