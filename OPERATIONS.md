# Operations

## Install

Run `scripts/install.ps1` from PowerShell. It requires Node.js 20+ and Git, installs the pinned Rojo 7.7.1 binary under ignored `.tools/` only when needed, verifies the official release SHA-256, and runs bootstrap checks. It does not edit PATH, install Roblox Studio, install the Studio Rojo plugin, or change Studio/ChatGPT/Codex settings.

## Diagnostics

Run `scripts/doctor.ps1`. It probes OS, CPU, memory, graphics names and NVIDIA VRAM, free workspace disk, Git, Node/npm, Python, Rojo, Luau tools, Blender, Ollama models, Roblox Studio, the official MCP launcher, Codex MCP registrations, and installed plugin metadata. It writes `evidence/environment-report.json` and `evidence/environment-report.md`. It does not read secrets, run model inference, or claim that each discovered model works.

## Start and stop

- `scripts/start-lab.ps1` starts Node hidden at `127.0.0.1:4177`, records its PID and logs under ignored `.lab-runtime/`, polls the actual health endpoint, then opens the dashboard.
- `scripts/stop-lab.ps1` verifies the PID still matches this workspace and Node executable, requests the named same-origin shutdown route, waits up to 10 seconds for graceful exit, then records the stopped state. A timeout leaves the process running for inspection.
- `npm start` runs in the current terminal for interactive development.

## Build and validation

- The Projects workbench inspects and builds one selected project with pinned Rojo 7.7.1. It accepts no command options; it validates and snapshots only manifest-declared paths within the project, then writes a uniquely named `.rbxlx` and operation record under ignored `.lab-runtime/`. Successful artifacts can be downloaded from the workbench. This is an offline place build; it does not start live sync, change an open place, or publish anything.
- `scripts/build-all.ps1` generates ignored `.rbxlx` place files under `.lab-runtime/builds/` from each valid Rojo project and updates the generated `evidence/build-report.json` report.
- `npm test` includes the Windows integration test for `scripts/run-luau-specs.ps1`, which executes the three Roblox-free pure Luau specs with pinned Luau 0.745. Engine-dependent project `.spec.luau` files still require an identified Studio runner.
- `npm run verify:task-execution` exercises the fixed local Tasks MCP workflow with separate owner/reviewer processes, scoped staging, rejection/remediation, pinned validation, and persistence. The fixture is test-only and does not certify a real AI provider or game project.
- `npm run verify:evidence` validates typed evidence references and their pinned hashes, then checks the evidence API and Control Room overview integration.
- `scripts/test-all.ps1` runs `node --test`, Luau syntax parsing, and all declared Rojo builds. It does not run Studio, device, or multiplayer tests.
- `scripts/verify-roblox.ps1` records Studio installation and version, launcher presence, Rojo version, and live MCP status. If the Lab server is running and connected, it also reads Studio state, a real Workspace tree, console output, and the latest saved viewport capture. It does not certify objectives, multiplayer, or performance.
- The Control Room reads the validated status register from `docs/quality/lab-capability-register.json`; `GET /api/capabilities` exposes requirement detail, while `GET /api/overview` returns its summary. Update the register only when implementation and evidence support the new status. A verified row needs passing evidence and no open critical or high defects.

## Backup and recovery

Run `scripts/backup.ps1` to create a timestamped local archive in `.lab-backups/`. Restore by extracting into a new directory and reviewing the difference before replacing any active project. The script does not delete or overwrite prior backups.

## Logs and retention

Runtime logs remain in ignored `.lab-runtime/logs/`; named Rojo build records remain in `.lab-runtime/operations/rojo-builds/`. Build files and operation records are uniquely named and are not automatically deleted. The Lab writes no telemetry and keeps MCP results in memory except for explicit evidence captures. Delete generated artifacts only through normal user-controlled workspace cleanup after reviewing their contents.
