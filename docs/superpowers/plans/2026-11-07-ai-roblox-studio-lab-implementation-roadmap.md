# AI Roblox Studio Lab Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the AI Roblox Studio Lab against the approved closure specification with a recoverable local-first control plane, structured game and engine intelligence, an original asset factory, verified benchmarks, and an independently evidenced release candidate.

**Architecture:** Keep the existing Node.js loopback control center and official Roblox Studio MCP boundary. Add versioned, searchable knowledge records and an explicit task/evidence workflow; retain source and evidence in the repository, use Blender and Studio for real production, and gate claims by repeatable tests and independent review. Execute the work through the six subsystem plans below; the separately selected flagship receives its own project-specific implementation plan after audience research.

**Tech Stack:** Node.js 20 or newer; pinned Luau 0.745 runtime/parser/analyzer; pinned Rojo 7.7.1; Blender 5.2 detected locally; Roblox Studio and its official local MCP server; PowerShell on the required Windows workstation; repository-local JSON/Markdown records and Node’s built-in test runner.

## Global Constraints

- The Lab is local-first and provider-agnostic. Hosted CI is optional and remains unconfigured until an owner-approved provider and remote are selected.
- The production target begins at **midrange mobile and desktop**. Higher tiers may receive richer visual quality.
- Keep the dashboard bound to `127.0.0.1`; do not add arbitrary process execution, arbitrary file reads/writes, or generic MCP invocation.
- Use Roblox’s built-in Studio MCP as the live connection. Call `list_roblox_studios` and confirm instance and place identity before a live operation.
- Do not upload assets, publish, buy assets, enable paid services or Open Cloud scopes, change live settings, or access production data without explicit authorization for that exact action.
- Classify every asset as Hero, Major, Supporting, or Utility. Hero assets and final art direction require explicit human visual approval.
- Preserve editable source, rights status, export configuration, tool/dependency versions, hashes, final Roblox import information, and review evidence for reusable assets.
- Lower quality tiers may reduce geometry, texture resolution, effects, and environmental complexity only while preserving essential silhouette, readability, identity, and gameplay.
- Knowledge and capability maturity is L1 Knowledge, L2 Design, L3 Execution, or L4 Certification. Documentation or an agent claim alone cannot award L3/L4.
- Treat unknown, beta, experimental, announced, delayed, and unavailable platform features distinctly; do not build a dependency on a roadmap item before it is available in the target Studio version.
- Keep Signal Garden and Misprint Menagerie as engineering/production benchmarks. Select a separate flagship only after audience research and concept testing.

---

## Plan package and dependency order

| Order | Plan | Required outcome | Depends on |
|---|---|---|---|
| 1 | [Lab recovery and P0 repairs](2026-11-07-lab-recovery-and-p0-repairs.md) | Reviewed local baseline and restore test; portable path contract; repaired Signal Garden loop; verified SignalBloom representation or an explicit blocked boundary. | None |
| 2 | [Verification and evidence foundation](2026-11-07-lab-verification-and-evidence.md) | Truthful Node/Luau/Rojo/Studio gates and structured evidence with reproducible source and environment identity. | Plan 1 |
| 3 | [Game Intelligence and task orchestration](2026-11-07-roblox-game-intelligence-and-orchestration.md) | Linked engine, game/creative, and verified-production knowledge; an operational task graph that assembles work by dependencies. | Plans 1–2 |
| 4 | [Creative asset factory](2026-11-07-creative-asset-factory.md) | Reproducible original art workflow, enforced asset classes, separate technical/artistic approval, and a human-approved original Hero proof. | Plans 1–3 |
| 5 | [Verified benchmark library](2026-11-07-verified-roblox-benchmark-library.md) | Eight compact, independently reproducible benchmark scenes/projects with known scenarios and evidence. | Plans 1–4 |
| 6 | [Flagship discovery and Lab certification](2026-11-07-flagship-discovery-and-certification.md) | Audience-tested separate flagship, project-specific production plan, unfamiliar-hybrid exercise, and unpublished RC certification. | Plans 1–5 |

Do not start a later plan’s production tasks while a required upstream gate is failed or blocked. If a platform permission, compatible Studio connection, target phone, or approved human reviewer is unavailable, record the exact gate as `blocked` with its evidence and proceed only on independent work.

Treat `docs/superpowers/plans/2026-11-06-ai-roblox-studio-lab.md` as historical status input, not as a competing implementation sequence. Refresh its reported test/build state only from actual Plan 1 command output.

## Program-level completion review

- [ ] Each subsystem plan’s acceptance criteria passes with linked evidence.
- [ ] Cross-plan interfaces remain consistent: knowledge IDs, task IDs, asset IDs, evidence statuses, file ownership, and Studio/place identity.
- [ ] The flagship-specific plan is written after concept selection and before game-specific implementation; it identifies exact project files, player scenarios, target budgets, and reviewers.
- [ ] The held-out hybrid concept has not been used to seed a fixed template; the planner reports unknowns and composes dependencies from evidence-backed records.
- [ ] An unpublished release candidate passes the [closure design](../specs/2026-11-07-ai-roblox-studio-lab-closure-design.md) certification list. Publication and production operations remain separate owner-authorized actions.
