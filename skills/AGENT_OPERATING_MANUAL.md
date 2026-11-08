# AI agent operating manual

This manual is the portable entry point for Codex and other compatible agents. Read repository `AGENTS.md`, `ARCHITECTURE.md`, project `README.md` and design notes before changing an experience. The checked-in source and current local evidence outrank conversational memory.

## Establish the actual state

1. Run `git status --short --branch`, inspect the selected project and its `default.project.json`, dependency manifests, asset ledger, and recent evidence. Preserve existing edits.
2. Read the project's design brief, authority model, quality gates, and relevant specialist playbooks in `skills/roles/`.
3. Use `npm run doctor` or `scripts/doctor.ps1` to inspect local tools. It does not enable tools or connect an account.
4. For Studio tasks, inspect the current MCP tool inventory and call `list_roblox_studios`. A running process, config entry, or dashboard badge alone is not proof of connection. Select the place by its returned instance id; do not infer it from names.
5. Record unknowns. If a check needs an open Studio place, two clients, a target device, or account permissions, mark it blocked and continue independent source work.

## Work a change through the system

1. State the player problem and measurable completion condition before editing. For substantial work, use the Lab's plan template and identify owner files and dependencies.
2. Inspect neighboring code and test conventions. Prefer a small, integrated change to a parallel implementation of an existing system.
3. Preserve server authority for shared state. Treat every client request, remote argument, model, asset, and MCP result as untrusted; validate type, ownership, ancestry, distance, state, rate, and size at the boundary.
4. Keep source changes reproducible in Rojo. Do not hand-edit generated place exports as the source of truth. Record asset license, source, processing, scale, collision, texture and performance budgets in `assets/asset-ledger.json`.
5. Run the relevant tests and build. Keep raw outcomes or durable report paths. Separate source-level checks from live Studio, multiplayer, visual, device, and release checks.
6. Update design, architecture, provenance, and release records when the change makes them stale. Never describe unmeasured behavior as verified.

## Studio connection and operation

Follow `docs/workflows/studio-connect.md`. Use the official local Studio MCP endpoint and verify the instance list before an inspection. The Lab bridge intentionally exposes read-only data. Editing, playtesting, publishing, uploads, monetization and Open Cloud scopes are separate actions; follow the user's explicit task and inspect each operation's scope. Do not change account settings or publish from this manual.

When editing is authorized, prefer the official ChatGPT Studio tools or a reviewed Rojo source-sync action. Before writing, capture current state and identify the exact instance/path. After writing, read it back, run the appropriate test, inspect console output, and capture the result. A source build is not a Studio runtime pass.

## Specialist roles and handoff

Select the smallest set of roles needed; the role files describe domain workflow, not an automatic agent launch. A role may ask for review but cannot silently expand scope or authorize an external side effect. Keep one canonical project context in checked-in project documents and evidence; do not rely on private chat state.

Every cross-role handoff uses `docs/workflows/agent-handoff.schema.json`. Include project and Studio instance identity, changed files, design/technical decisions, named checks with `passed`, `failed`, `blocked`, or `not_run` status, risks and one actionable next step. The receiver checks the working tree and reads the cited evidence before relying on the handoff.

## Quality gates

- **Design:** a clear player promise, meaningful choice, readable feedback, accessibility and replay reason.
- **Engineering:** source mapping, module ownership, failure paths, server authority, deterministic behavior where appropriate, bounded work, cleanup and compatibility.
- **Assets:** original or licensed source with complete provenance; correct import dimensions, collision, streaming, LOD, memory and mobile cost.
- **QA:** automated source checks plus live playtest, multiplayer abuse cases, visual captures and target-device profile as applicable.
- **Release:** `docs/workflows/release-certification.md` has evidence for every gate. Blocked is not passed. Publishing and paid platform operations require explicit authorization.

## Handoff example

```json
{
  "schemaVersion": 1,
  "objective": "Add a second cooperative route to Signal Garden",
  "summary": "Server validates both relay inputs and the chosen route.",
  "project": { "name": "signal-garden", "path": "projects/signal-garden", "studioInstanceId": null, "placeId": null },
  "assumptions": ["Live two-client validation needs an enabled Studio MCP session."],
  "changedFiles": ["projects/signal-garden/src/server/SignalGardenService.server.luau"],
  "decisions": ["The server owns route state and rejects stale requests."],
  "checks": [{ "name": "Node source tests", "status": "passed", "evidence": ["node --test"], "notes": "Source-only checks; no Studio run." }],
  "risks": ["Two-client latency remains unmeasured."],
  "nextStep": "Run the route puzzle with two Studio clients and save console and viewport evidence.",
  "handoffTo": "QA Director"
}
```
