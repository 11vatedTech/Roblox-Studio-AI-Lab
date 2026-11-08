# ADR-001: Local control center and official Studio integration

- **Status:** Accepted for implementation
- **Date:** 2026-11-06

## Context

The Lab needs a browser control center, repeatable source projects, local diagnostics, and access to a real Roblox Studio session. Studio exposes its official MCP server as a local stdio process. Studio-side MCP permissions are controlled by the Roblox user and may include operations that alter games, publish content, use player data, or spend Robux.

## Options considered

| Option | Reliability | Maintainability | Security | Cost | Result |
|---|---|---|---|---|---|
| Official Studio MCP only | Strong live integration; no Lab state or workflow dashboard | Low code, but weak reusable process | Studio permission model is authoritative | Lowest | Insufficient as a Lab |
| Local control center plus official MCP (chosen) | Real local inventory, reproducible workflows, direct Studio reads | Small Node core; first-party bridge remains upstream-owned | Loopback-only API, origin checks, named read allowlist, no credential handling | Free, no runtime dependencies | Best fit |
| Replace Studio MCP with a custom plugin/proxy | Duplicates Studio lifecycle and capabilities; risks version drift | Highest ongoing maintenance | Reimplements sensitive operations and permission boundaries | Free initially; high support cost | Rejected |

## Decision

Use a dependency-free Node.js local service for diagnostics, project files, evidence, and dashboard data. Keep it bound to `127.0.0.1`. For Studio reads, connect through Roblox's installed `mcp.bat` and call a fixed allowlist. Keep mutating work in the official Roblox integration, where the Studio user can see and control its permissions. Projects use standard Rojo layouts, but the Lab reports Rojo as unavailable until an executable is actually found.

## Consequences

- No API keys or paid service are required for local development.
- Dashboard status can show a real disconnected/connected state by requesting `list_roblox_studios`; a running Studio process alone is not treated as an MCP connection.
- The official bridge must be enabled in Studio and available to the Lab process. If the server fails to initialize, diagnostics preserve the failure instead of simulating connected state.
- Dashboard routes never expose a general-purpose shell or unrestricted MCP invocation.
- Live edits, asset uploads, publishing, Open Cloud, and player data remain outside the dashboard's read-only bridge and require explicit authorization in the relevant tool.
- The Node implementation must be revisited if the official server changes its stdio transport or permission model.

## Revisit when

Reconsider this boundary if Roblox deprecates the installed launcher, if Studio exposes a supported authenticated local HTTP API, or if measured user workflows demonstrate that the read-only boundary prevents a required safe operation.
