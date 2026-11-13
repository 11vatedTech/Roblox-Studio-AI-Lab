# LabKit 1.0 — production framework for Lab-built Roblox experiences

LabKit is the shared Luau runtime every Lab project starts from. It covers the systems
commercial Roblox games most often get wrong and that players and exploiters find first:
remote validation, save-data loss and duplication, double-granted purchases, currency
exploits, untestable randomness, and inconsistent UI. Agents (Freebuff, Claude, Codex,
or a human) should build gameplay on these modules instead of re-implementing them.

| Module | Use it for | Key guarantees |
|---|---|---|
| `Net` | Every client↔server message | Declared contracts only; per-player token-bucket rate limits; schema-checked args; extra args, NaN, wrong direction, and unknown remotes rejected with stable reason codes; handler errors contained |
| `Schema` | Remote args, save data, config | Finite numbers, integer/range checks, bounded UTF-8 strings, dense bounded arrays, strict structs (unknown keys rejected), maps, enums, unions, Instance/Vector3 checks |
| `RateLimiter` | Any spammable action | Per-key token bucket with injectable clock |
| `PlayerData` | Persistence | UpdateAsync session lock; stale-lock steal; ownership re-check on every save; `session_lost` signal to kick instead of duplicating; versioned migrations; refusal of newer-schema data; deep template reconcile; bounded retry/backoff; validation hook; memory adapter for Studio/CLI |
| `Receipts` | Developer products | Grants once per PurchaseId; marker saved in the same write as the grant; returns granted only after a successful save; retries never re-grant |
| `Economy` | Currencies | Positive-integer amounts; no negatives; caps; atomic multi-currency apply; idempotency keys; purchase with automatic refund on grant failure; transaction events for analytics |
| `Inventory` | Items | Catalog-only IDs; stack sizes; slot capacity; unique items; sorted client-safe listing |
| `StateMachine` | Rounds, NPCs, abilities, UI flows | Declared transitions; guards; ordered exit/enter hooks; `Changed` signal; history |
| `Rng` | Procedural content, daily seeds, tests | Deterministic xorshift32 seeded by number or string (FNV-1a); integer/float/pick/shuffle/weighted/fork |
| `LootTable` | Drops, eggs, crates | Exact published odds per item and rarity (Roblox disclosure policy for paid random items); pity guarantees |
| `Spring` | UI/camera/recoil motion | Fixed 1/240 s sub-steps: identical results at any frame rate |
| `Theme` | UI tokens | Palette, spacing, radius, type scale, 44 px touch target; WCAG contrast helpers (the palette is spec-checked for AA/AAA) |
| `Create` | Declarative instances | Properties before Parent; events; children; injectable factory |
| `Signal`, `Trove`, `Retry` | Lifetimes and resilience | Re-entrant-safe signals with error isolation; LIFO cleanup of connections/instances/threads; bounded backoff with jitter |

## Install in a project

New projects created with the `production` template get a vendored copy automatically:

```
POST /api/projects { "name": "my-game", "template": "production" }
```

The scaffolder copies `src/` to `Packages/LabKit`, points `default.project.json` at it, and
writes `Packages/labkit.lock.json` with the LabKit version and SHA-256 of every file, so
upgrades and local edits are detectable. Map it to `ReplicatedStorage.Packages.LabKit` and
`require(ReplicatedStorage.Packages.LabKit)`.

## Verify

```
scripts/run-luau-specs.ps1     # pinned Luau 0.745: tests/*.cli.spec.luau
scripts/test-all.ps1           # Node suite, parse, Luau specs, Rojo builds (incl. this package)
```

The CLI specs exercise logic only. Engine behaviour (DataStore quotas, replication, real
ProcessReceipt calls, UI layout on devices) still needs Studio and device evidence before a
game built on LabKit can be called release-ready.

## Rules for contributors and agents

- Keep every module Roblox-free at load time (engine services only inside functions or via
  injected options) so specs run under the stock Luau CLI.
- Sibling modules use the dual-mode `import` helper: `script.Parent[name]` in Roblox,
  `"./" .. name` under the CLI.
- Bump `version` in `src/init.luau` for any behaviour change and add or update a spec.
