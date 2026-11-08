# Roblox Game Intelligence research log

Reviewed: 2026-11-07

This log records sources and design judgments for the initial local registry. A citation establishes provenance, not implementation competence. Official Roblox documentation is version-sensitive and must be rechecked before a production implementation depends on a specific API or feature state.

## Initial structured records

The first records cover RPG/adventure, collection/progression, strategy/tactics, hybrid composition, tactical card combat, stylized fantasy, combat animation, Roblox client-server authority, and player onboarding.

| Record | Evidence basis | Maturity and boundary |
| --- | --- | --- |
| genre.rpg-adventure, genre.collection-progression, genre.strategy-tactics, genre.hybrid-experiences | Approved closure design; [Design for Roblox](https://create.roblox.com/docs/production/game-design/design-for-roblox) | L2 design packages; no claim that a complete experience in each family has been built |
| mechanic.tactical-card-combat and engine.networking-authority | Approved closure design; [Remote events](https://create.roblox.com/docs/scripting/events/remote); [client-server security](https://create.roblox.com/docs/scripting/security/client-server-boundary) | L2 guidance; not a security certification or tested combat implementation |
| style.stylized-fantasy | Approved creative-production and device-tier requirements; [Design for performance](https://create.roblox.com/docs/performance-optimization/design) | L2 style specification; no final art direction or approved Hero assets exist here |
| animation.combat | [Animation Editor](https://create.roblox.com/docs/animation/editor); approved animation acceptance requirements | L2 production guidance; exact rigs and current Studio details must be checked during implementation |
| product.player-onboarding | [Design for Roblox](https://create.roblox.com/docs/production/game-design/design-for-roblox); approved Lab product requirements | L2 design guidance; audience and funnel hypotheses require research |

## Decisions and explicit unknowns

- Families and mechanics are multi-label. Records give compositional questions and contracts; they are not genre templates.
- L2 means structured design guidance. L3 requires actual implementation evidence. L4 requires separate certification evidence.
- The minimum device tier is midrange mobile plus desktop. Actual device models and numeric performance budgets remain unknown until profiled.
- Exact Roblox, Studio, MCP, and model versions were not captured as part of this source research.
- The approved catalog spans far more than the current seeds. FPS/TPS, racing, horror, simulation, social/roleplay, sports, puzzle, sandbox, survival crafting, and other families remain explicit coverage work. Additional mechanics, visual styles, animation disciplines, engine capabilities, benchmarks, and production evidence also remain to be authored and verified.
- The specialist registry contains a broader planned capability vocabulary than the seeded record set. A capability reference without a corresponding validated knowledge record is a coverage gap, not evidence that the Lab has mastered it.
- Signal Garden's local two-client Echo collection check is separate execution evidence for one narrow mechanic. It does not certify the general records, cross-server behavior, persistence, hostile-client security, target-device performance, or a genre family.

## Review cadence

Recheck official documentation before using a version-sensitive capability and record retrieval date and checked engine/Studio version. Review design packages when implementation evidence, independent QA, creator policy, or a relevant engine change invalidates an assumption. Only verified project outcomes should promote a record to L3 or L4.
