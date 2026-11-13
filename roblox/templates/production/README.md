# Production starter (LabKit)

A complete, small, server-authoritative game loop that exercises every production system a
commercial Roblox experience needs, so an agent starts from working infrastructure and spends
its effort on the game's actual identity.

**Loop:** collect orbs → earn Coins → buy upgrades (orb value, magnet range, walk speed) →
collect faster. Progress persists across sessions.

| Concern | Where | How |
|---|---|---|
| Persistence | `src/server/DataService.luau` | LabKit `PlayerData` with UpdateAsync session locks, autosave, `BindToClose` release, kick on `session_lost` or newer-schema data; in-memory fallback (logged) when Studio API access is off |
| Authority | `src/server/GameService.luau` | Orbs are server parts collected by a server-side pickup scan using server character positions (Magnet widens the radius). No client input or remote can award currency |
| Remotes | `src/shared/Remotes.luau` | LabKit `Net` contracts with schemas and rate limits for buy/settings/state |
| Economy | `GameService` + `Rules` | LabKit `Economy` purchase with refund-on-failure; AnalyticsService economy events (source/sink) |
| Monetization | `GameConfig.products` | Disabled by default (nil product IDs). Once the owner creates products, LabKit `Receipts` handles ProcessReceipt idempotently |
| Rules | `src/shared/Rules.luau` | Pure functions shared by server and client; covered by `tests/rules.cli.spec.luau` |
| UI | `src/client/Hud.client.luau` | Theme tokens, 44 px touch targets, spring-animated coin counter, toasts, reduced-motion setting persisted on the server |
| Config | `src/shared/GameConfig.luau` | Every tunable value and the data version |

## Make it your game

1. Create a project: `POST /api/projects { "name": "my-game", "template": "production" }`.
2. Write the design brief (`docs/templates/game-design-brief.md`). Replace the orb loop with the
   brief's core verb; keep `DataService`, `Remotes`, and the `Economy`/`Receipts` wiring.
3. Add new client messages only in `Remotes.luau`, each with schemas and a rate limit.
4. Put rules in `Rules.luau` (or new pure modules) and cover them with `*.cli.spec.luau`.
5. Bump `GameConfig.dataVersion` and add a migration in `DataService` whenever the saved shape
   changes in a non-additive way.
6. Replace graybox geometry with ledger-tracked assets (`assets/asset-ledger.json`).

## Evidence boundary

Local checks prove rules and builds only. Before release: Studio server/client play, two-client
replication, DataStore behaviour with API access, device layout on phone/tablet/console, and
performance profiles, recorded under `evidence/`.
