# Release certification record

Use this record for a release candidate. Keep evidence paths and raw output; do not turn an unrun check into a pass.

| Gate | Required evidence | Status |
|---|---|---|
| Source and dependency inventory | Project manifest, dependency list, pinned tool versions | Not run |
| Luau analysis and type checks | Tool name/version, full command output, findings | Not run |
| Server authority and remote abuse | Invalid type/range/ownership/rate tests in Studio | Blocked until Studio session is connected |
| Persistence and recovery | Save/load, throttling, retry, duplicate request, shutdown and recovery test | Not run |
| Client/server playtest | Studio instance/place identity, scenario results, console logs | Blocked until Studio session is connected |
| Visual review | Real viewport captures, target resolution, before/after notes | Blocked until Studio session is connected |
| Performance | Target device, frame-time/memory/network profile and thresholds | Not run |
| Asset licensing and budgets | Completed asset provenance ledger and Studio import review | Not run |
| Platform, privacy, and monetization review | Current official policy references and reviewed feature inventory | Not run |

Final status is **not certified** until every required gate has a defensible disposition and its evidence is reviewed. A blocked gate may be accepted only by the release owner with a documented risk decision.
