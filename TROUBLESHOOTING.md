# Troubleshooting

## Dashboard will not start

- Check `node --version` is 20 or newer.
- Run `scripts/doctor.ps1` and inspect `evidence/environment-report.md`.
- If port 4177 is occupied, identify the process before stopping anything. The Lab binds to 127.0.0.1 only.
- Read `.lab-runtime/logs/lab.stderr.log` and `lab.stdout.log`.

## Studio MCP is disconnected

- Open a place; the MCP controls are not available from Studio's start screen.
- In Assistant settings, enable Studio as an MCP server.
- In ChatGPT, install/use Roblox's official Studio integration and select ChatGPT (codex) in Quick Connect, then restart ChatGPT or open a new chat.
- In the Lab dashboard, connect again and confirm an actual Studio instance appears.
- An empty list means the server process answered but Studio has no enabled/open place. The process alone is not proof of connection.
- Review [Roblox's current MCP setup](https://create.roblox.com/docs/studio/mcp) before changing settings.

## Rojo build fails

- Run `.\tools\rojo-7.7.1\rojo.exe --version` and confirm 7.7.1.
- Validate `default.project.json` as JSON and check that mapped source directories exist.
- Install the official Rojo Studio plugin separately, open its toolbar, and connect to the local sync server only for the intended project.
- Do not use the build output as a replacement for testing in Studio.

## Static quality report flags a concern

The analyzer is heuristic and may require manual review. Read the exact file and line. It intentionally never certifies a project. Confirm each server remote's type, ancestry, distance, permission, state, and rate checks in code and playtests.

## Environment report shows stale hardware data

Run `scripts/doctor.ps1` again. The dashboard displays the saved report timestamp separately from its live PATH probes.
