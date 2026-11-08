# Flagship Discovery and Lab Certification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select and deliver a separate original Roblox flagship through evidence-led audience research, then certify the Lab against an unfamiliar hybrid concept and an unpublished release candidate.

**Architecture:** Keep Signal Garden and Misprint Menagerie as technical benchmarks. The flagship is chosen only after recovery, intelligence, asset production, and representative benchmarks have working evidence. This plan produces the research protocol and selection gate; once a concept is selected, write a new project-specific implementation plan naming the literal project slug and source files before producing the game.

**Tech Stack:** Existing local Node/Rojo/Luau/Blender/Studio workflow; structured local research records; physical midrange mobile and desktop testing; official Studio MCP; no mandatory analytics, cloud, monetization, or paid research service.

## Global Constraints

- Do not select a flagship from the existing concept scores alone; those are design estimates, not player validation.
- Research at least three distinct original concepts and identify what evidence could reject each.
- Obtain appropriate permission before recruiting testers or sending any external messages; collect only data needed for the stated player-value question.
- Do not make revenue, retention, adoption, or market-size promises; record hypotheses separately from observed results.
- Produce professional original assets and complete gameplay loops; do not label a graybox or bounded vertical slice as a finished flagship.
- Human approval is required for Hero assets and final art direction; performance certification requires actual target hardware.
- The release candidate remains unpublished unless a separate explicit publication authorization is given.

---

### Task 1: Prepare a consistent audience research and concept rejection protocol

**Files:**
- Create: `docs/showcase/flagship-research-protocol.md`
- Modify: `docs/showcase/concept-selection.md`
- Create: `docs/showcase/concept-research-record.schema.json`
- Create: `docs/showcase/concept-research-record.json`

**Interfaces:**
- A concept record includes player promise, audience hypothesis, game-family/mechanic/style IDs, differentiation hypothesis, benchmark fit, production assumptions, risks, test question, method, permission/privacy note, observations, and decision.
- Design scoring and player observation are separate fields; missing evidence is `unknown`, not a default score.

- [ ] Define a neutral test script that compares concepts using the same player task and questions.
- [ ] Require at least three distinct concepts and one falsifiable risk/rejection condition per concept.
- [ ] Define a minimal research record that avoids storing usernames, contact details, or unrelated personal information.
- [ ] Review the planned research method and external-contact requirements before recruiting or sending messages.

Expected: the selection criteria can reject every candidate, distinguish observed player behavior from designer interpretation, and preserve privacy.

### Task 2: Research and select the separate flagship

**Files:**
- Update: `docs/showcase/concept-selection.md`
- Update: `docs/showcase/concept-research-record.json`
- Create: `docs/showcase/flagship-selection-record.json`
- Create after selection: `docs/showcase/flagship-brief.md`
- Create after selection: `docs/showcase/flagship-art-bible.md`

**Interfaces:**
- Selection consumes the three-or-more concept research records and produces one signed selection record with reasons, rejected alternatives, remaining hypotheses, and owner decision.

- [ ] Produce at least three original candidate briefs using Game Intelligence records and a different creative thesis for each.
- [ ] Test player comprehension, appeal, intended loop, and one key risk with consented participants using the same neutral protocol.
- [ ] Record raw observations without identifying participants, then record design interpretation and uncertainty separately.
- [ ] Select one concept only if it shows a coherent player promise and a credible next learning/production step; document why others were rejected or deferred.

Expected: a separate flagship is chosen from measured research artifacts, not because a candidate is convenient to the current repository.

### Task 3: Write the game-specific production plan before building

**Files:**
- Create after selection: one separately reviewed, concept-specific implementation plan under `docs/superpowers/plans/`
- Create after selection: the selected experience’s canonical Rojo project directory under `projects/`
- Add project-specific Luau source, tests, art, manifests, and evidence only after the plan’s exact file map is approved

**Interfaces:**
- This gate consumes the approved selection record and produces the exact project name, canonical project manifest, art bible, and a reviewed implementation plan; no flagship gameplay files are created before all four artifacts exist.

**Gate:** The filename and project directory are intentionally deferred until Task 2 selects the exact concept. Do not begin game-specific production in advance. The next plan must use the selected project name and enumerate real source files, tasks, interfaces, test scenarios, target budgets, and human review gates.

- [ ] Translate the selected brief and art bible into a vertical but complete experience scope with full player loop, progression, reset/replay, multiplayer assumptions, accessibility, and device matrix.
- [ ] Have the task planner produce a dependency graph and bounded ownership; review unknowns, risks, and specialist requirements.
- [ ] Set per-experience frame-time/memory/network/content budgets for midrange mobile and desktop before implementation.
- [ ] Write and review the separate project-specific plan before touching its gameplay or asset files.

Expected: the selected game has an implementable end-to-end production contract; plan creation is a hard gate, not an omitted implementation detail.

### Task 4: Produce the flagship through integrated original work

**Files:**
- Exact changed files are specified by the approved game-specific plan from Task 3.
- Shared records: `assets/asset-ledger.json`, `docs/tasks/`, `evidence/`, and `docs/game-intelligence/` as needed.

**Interfaces:**
- Production consumes the approved flagship brief, art bible, game-specific plan, task graph, budgets, and asset contracts; it produces source, original assets, integrated play loop, and evidence required by that plan.

- [ ] Execute the approved plan’s tasks and record source digests, tool versions, and file ownership for each handoff.
- [ ] Produce original world, character/creature, animation, UI, VFX, and sound/music assets at the quality promised by the art bible.
- [ ] Complete gameplay/progression, onboarding, failure/recovery, replay, and server validation appropriate to the selected game.
- [ ] Review the integrated experience on actual target devices and independent visual/gameplay/security/performance review before claiming release-candidate readiness.

Expected: the entire intended player experience is playable and coherent; no incomplete primitive stand-in remains for promised Hero/Major art.

### Task 5: Run the held-out hybrid challenge and certify task composition

**Files:**
- Create: `docs/testing/held-out-hybrid-challenge.json`
- Create: `docs/testing/held-out-hybrid-review.md`
- Create task artifact under: `docs/tasks/`

**Interfaces:**
- Challenge input is not present verbatim in the knowledge catalog; output includes a proposed graph, unknowns, required specialists, reviewer findings, and pass/fail decision.

- [ ] Choose a hybrid concept absent verbatim from the stored genre packages; keep it separate from flagship training/example content.
- [ ] Ask a compatible agent to create a design/dependency graph using only retrieved evidence and disclose unknowns.
- [ ] Have an independent reviewer check composition originality, mechanics coverage, art/animation/engineering dependencies, network/security/device constraints, and failure/test cases.
- [ ] Fail the exercise if it returns a canned genre template, invents platform support, omits required specialists, or claims L3/L4 without actual execution evidence.

Expected: the Lab demonstrates evidence-backed reasoning on an unlisted hybrid and identifies when it needs research or a bounded prototype.

### Task 6: Prepare and independently certify the unpublished release candidate

**Files:**
- Update: `docs/workflows/release-certification.md`
- Create: `docs/releases/flagship-rc-1/runbook.md`
- Create: `docs/releases/flagship-rc-1/known-limitations.md`
- Add build, Studio, device, visual, security, product, and asset evidence through named evidence workflows

**Interfaces:**
- The release record binds the selected flagship’s source digest, asset rights/import records, Studio/place/device profiles, validation statuses, known limitations, rollback steps, and independent reviewer.

- [ ] Run clean restore, Node/Luau/Rojo gates, full Studio scenarios, multiplayer/security review, visual review, asset-rights review, and target-device profiling.
- [ ] Have an operator or compatible agent who did not author the work follow the root docs from a clean restore and reproduce project setup, commands, permissions, and a representative build without private conversation context.
- [ ] Record product/player-value results and remaining hypotheses; include a privacy and analytics decision with minimal data scope.
- [ ] Produce rollback/recovery instructions, known issues, owner handoff, and exact build/source digest for an unpublished RC.
- [ ] Obtain independent final review and ensure publication, uploads, live settings, monetization, Open Cloud, and production data remain off absent separate explicit authorization.

Expected: all closure-spec gates are `passed` or have an approved explicit exception; blocked or unrun gates prevent a Lab-complete claim. RC certification does not imply a published game.
