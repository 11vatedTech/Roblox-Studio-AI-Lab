# Contributing

## Working rules

- Follow [AGENTS.md](AGENTS.md), [Quality standards](QUALITY_STANDARDS.md), and the target project's canonical spec.
- Keep changes narrow, local-first, and reviewable. Do not add paid services, mandatory API keys, or silent telemetry.
- Write tests for behavior changes before implementation and use the built-in Node test runner for Lab code.
- Keep Studio write operations in the official Roblox integration. Do not widen the dashboard's MCP allowlist without a separate security decision and tests.
- Do not commit generated place files, test output, downloaded executables, or screenshots unless a task explicitly needs them as evidence.

## Local checks

```powershell
npm test
.\scripts\test-all.ps1
.\scripts\doctor.ps1
```

For a Luau project, run the pinned Rojo build, then inspect and test the place in Roblox Studio. Include test outcomes and remaining blockers in the handoff.

## Changes to operating surfaces

Record consequential architecture changes as a short ADR under `docs/architecture/`. Version external tools in `rokit.toml` and document checksum/source. Preserve user configuration; do not modify Studio, Codex, ChatGPT, provider, credential, or permission settings from a project setup script.
