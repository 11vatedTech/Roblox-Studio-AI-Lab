# ADR-002: Specialist task execution through bounded MCP tools

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

The Agent Workbench had validated task plans and handoffs but no execution surface. Manual status updates could name a reviewer and mark work passed without evidence that a separate process had inspected it. The Lab needs real project outputs while preserving local control, declared file ownership, and the separate Roblox Studio permission boundary.

## Decision

Expose assigned task operations through a fixed local stdio MCP server. A connected AI client runs the specialist process; the Lab does not launch or select an AI provider. Each MCP server process receives a scoped task claim token held in that process. The owner writes only declared paths to a project-local staging area. A reviewer must use a different server process and session. The reviewer may reject for correction or accept after checking output hashes, original source hashes, bounded text/JSON integrity, and (for Roblox source changes) the pinned Luau parser, project CLI specs, and staged Rojo build.

Acceptance atomically integrates staged outputs where possible and records evidence containing process/session IDs, client-reported metadata, tool results, and the limit that no person or AI-provider identity is attested. Task-plan updates cannot mark work passed directly. Claims have bounded leases, explicit cancellation, stale-claim recovery, per-project cross-process locks, and path-conflict checks.

The task server is separate from Roblox Studio MCP. It exposes no arbitrary shell, file, or MCP invocation, and it cannot mutate a Studio place. A local AI host decides where model prompts are processed; the Lab itself makes no provider calls.

## Consequences

- Approved tasks can produce real project files using existing AI clients that support stdio MCP.
- Staged work does not replace project source until reviewer acceptance; concurrent source changes cause acceptance to fail.
- Process/session separation improves attribution but does not prove that different models, providers, or humans performed the work.
- Source parser and Rojo evidence does not certify Roblox runtime, multiplayer, device, or published-place behavior. Those gates still require Studio evidence.
- The workflow depends on the local pinned Rojo and Luau toolchain for code tasks; missing tools fail validation visibly.
