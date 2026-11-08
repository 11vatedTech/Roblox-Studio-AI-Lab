# Specialist playbooks

Use [the operating manual](AGENT_OPERATING_MANUAL.md) first, then load only the roles that own the current decision. These files define work and review responsibilities; they do not claim autonomous services are running.

Freebuff discovers the project entry skill at `.agents/skills/roblox-production-lab/SKILL.md`. That skill routes the agent to this operating manual, role playbooks, project contract, and evidence gates instead of copying them.

| Role | Playbook | Owns |
|---|---|---|
| Creative Director | [creative-director.md](roles/creative-director.md) | Player promise, tone, creative coherence |
| Game Design Director | [game-design-director.md](roles/game-design-director.md) | Core loop, decisions, tuning |
| Principal Roblox Architect | [principal-roblox-architect.md](roles/principal-roblox-architect.md) | DataModel, boundaries, dependencies |
| Senior Luau Engineer | [senior-luau-engineer.md](roles/senior-luau-engineer.md) | Typed modules, correctness, maintainability |
| Gameplay Engineer | [gameplay-engineer.md](roles/gameplay-engineer.md) | Player-facing mechanics and feedback |
| Multiplayer Engineer | [multiplayer-engineer.md](roles/multiplayer-engineer.md) | Replication, authority, latency, lifecycle |
| Technical Artist | [technical-artist.md](roles/technical-artist.md) | Runtime art budgets and pipeline integration |
| Environment Artist | [environment-artist.md](roles/environment-artist.md) | Landmarks, navigation, environmental composition |
| 3D Asset Specialist | [asset-specialist.md](roles/asset-specialist.md) | Mesh, texture, collision and provenance |
| Character and Rigging Specialist | [character-rigging-specialist.md](roles/character-rigging-specialist.md) | Avatar compatibility, rigs, deformation |
| Animation Director | [animation-director.md](roles/animation-director.md) | Motion language and animation integration |
| VFX Specialist | [vfx-specialist.md](roles/vfx-specialist.md) | Readable and budgeted visual feedback |
| Audio Designer | [audio-designer.md](roles/audio-designer.md) | Spatial sound, mix, accessibility |
| UI/UX Director | [ui-ux-director.md](roles/ui-ux-director.md) | Interaction, hierarchy, device adaptation |
| Economy and Progression Designer | [economy-progression-designer.md](roles/economy-progression-designer.md) | Rewards, pacing, ethical progression |
| AI/NPC Systems Engineer | [ai-npc-systems-engineer.md](roles/ai-npc-systems-engineer.md) | NPC state, perception and bounded decisions |
| Security Engineer | [security-engineer.md](roles/security-engineer.md) | Trust boundaries, exploit resistance, privacy |
| Performance Engineer | [performance-engineer.md](roles/performance-engineer.md) | Profiles, budgets, device scaling |
| QA Director | [qa-director.md](roles/qa-director.md) | Risk-led coverage and release evidence |
| Product and Live Operations Strategist | [product-live-operations-strategist.md](roles/product-live-operations-strategist.md) | Player evidence, operations and hypotheses |

Use `docs/workflows/agent-handoff.schema.json` for cross-role work. Keep project-specific decisions in that project's docs, never in a global playbook.
