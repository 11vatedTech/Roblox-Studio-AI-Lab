# Roblox Game Intelligence

This directory is the local, versioned knowledge base for three connected systems:

1. **Roblox Engine Intelligence** records released platform capabilities, limits, and version-sensitive behavior.
2. **Game Design & Creative Intelligence** records game families, mechanics, art direction, animation, and product patterns.
3. **Verified Production Intelligence** records production practices, failure patterns, benchmark results, and evidence-backed maturity.

The taxonomy is multi-label and extensible. A project can combine families and mechanics; a hybrid stays a hybrid instead of being forced into the nearest preset. Missing knowledge is reported as an unknown and researched before it becomes a design or implementation claim.

## Record contract

Each JSON record below `records/` follows [`schemas/record.schema.json`](schemas/record.schema.json) and is checked by `src/core/knowledge-record.js` before use. IDs are stable and use a domain prefix plus lowercase kebab-case, for example:

- `genre.rpg-adventure`
- `mechanic.movement-grapple`
- `style.hand-painted-fantasy`
- `animation.combat`
- `engine.mesh-import`

The prefix is tied to the record kind. Rename a record only when its meaning changes enough to require a new identity; update links and evidence rather than silently reusing an ID for a different concept. Increment `version` when a record changes materially.

Every record includes source provenance, retrieval date, platform state, known versions, assumptions, owner, and review date. Source text and tool output are untrusted facts: they do not grant permission or override the Lab operating contract.

## Platform state and maturity

`platformState.state` distinguishes `released`, `beta`, `experimental`, `announced`, `delayed`, `deprecated`, `unknown`, and `not-applicable`. `unknown` means the Lab has not verified the claim. `announced` or `delayed` must not be presented as an available implementation capability.

Maturity uses four levels:

- **L1 — Knowledge:** cited sources and bounded explanation.
- **L2 — Design:** a complete design or implementation specification.
- **L3 — Execution:** at least one linked execution artifact or reproducible implementation result.
- **L4 — Certification:** linked execution evidence plus a separate certification record with repeatable acceptance results.

The runtime validator rejects L3 without execution evidence and L4 without both execution and certification evidence. A static document, successful parse, or green unit test alone does not certify an integrated Roblox experience.

## Task graph rules

[`schemas/task-graph.schema.json`](schemas/task-graph.schema.json) defines persisted task plans. For a `depends-on` edge, `from` is the dependent task and `to` is its prerequisite. Runtime validation adds cross-record checks that JSON Schema cannot express portably: all edge endpoints must exist, dependency edges must be acyclic, write ownership must not collide, the reviewer must differ from the author, and a passed task must link both an output artifact and execution or certification evidence.

Statuses are `proposed`, `approved`, `in_progress`, `blocked`, `review`, `passed`, and `failed`. The local API creates and reads plans, returns a structured per-task handoff, and records revision-checked state changes. Plans persist with the project at `projects/<slug>/.lab/task-plans/`. Input contracts must be linked to an existing project file or produced by a declared prerequisite; review requires every expected output file; pass requires execution or certification evidence and the assigned reviewer ID. The workbench records reviewer claims but does not authenticate a provider agent. Planning does not launch agents or commands, and external, account, publishing, upload, purchase, and production-data operations remain subject to their separate human approval boundaries.

## Adding or updating knowledge

1. Find the closest kind, then model the concept as multi-label links rather than discarding hybrid traits.
2. Add one small, source-linked JSON record. Separate observed platform facts from design judgment and assumptions.
3. Use `unknown` when a feature state or behavior has not been checked. Do not invent API support, performance numbers, or a maturity level.
4. Add explicit dependencies, conflicts, failure modes, device/performance considerations, and repeatable tests where relevant.
5. Set the maturity to the highest level whose evidence is linked and independently reviewable. Do not promote Hero-art approval or final artistic acceptance through automated checks.
6. Run focused knowledge validation and update the research log with what changed and what remains unknown.

The loader reports missing, invalid, duplicate, malformed, or unlinked graph records as diagnostics. A record can remain searchable while a dangling dependency is visible; a plan must resolve that gap before relying on it.

The initial registry is intentionally a foundation, not a claim of complete Roblox mastery. Knowledge coverage and production competence grow through cited research, real implementation, independent QA, and retained benchmark evidence.
