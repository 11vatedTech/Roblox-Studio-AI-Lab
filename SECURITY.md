# Security policy

## Default stance

The Lab is local-only and binds to `127.0.0.1`. It has no account system because it does not bind to LAN or the public Internet. The local web service rejects non-loopback Host values, requires same-origin JSON for state changes, sets a restrictive content security policy, and exposes only exact static paths and explicit API routes.

## Studio and MCP

Roblox's built-in Studio MCP server is the primary integration. The dashboard's MCP bridge calls only named read tools. It does not accept a caller-supplied tool name, shell command, file path outside a selected local root, Studio instance not returned by the current session, or arbitrary Luau text. MCP messages and tool results have size and time limits. Environment variables are allowlisted before the MCP child process starts.

ChatGPT's official Roblox Studio tools can modify the currently open place and may access additional permissions if the user grants them in Studio. Save a place version and use a test experience. Studio controls Open Cloud scopes per game. The Lab never enables them, uploads assets, publishes places, changes game settings, purchases assets, spends Robux, or writes player data.

## Local file handling

- Project names are restricted to safe Windows directory slugs.
- Root-contained path resolution rejects host-independent absolute, drive-qualified, traversal, and embedded-separator inputs; callers split approved relative paths into individual components first.
- Project, documentation, and skill reads reject traversal and symbolic links, and impose text size limits.
- Project creation stages a complete template inside `projects/` before renaming it into place.
- Backups include the approved source roots, a per-file SHA-256 manifest, and are written beneath `.lab-backups/`; backup archives are never cleaned up automatically. Restore verification rejects unsafe paths and links and extracts only into a new temporary directory.
- No credential values, environment-variable contents, player identifiers, or analytics payloads are collected by the doctor report.

## Reporting a vulnerability

Keep sensitive reports private. Include the affected version, exact reproduction steps, expected impact, and whether Roblox account or player data is involved. Do not include real credentials or production player records in an issue.
