# Roblox engine reference

## Source and freshness

The engine-reference service retrieves Roblox's current class YAML from the official [Roblox Creator Docs repository](https://github.com/Roblox/creator-docs/tree/main/content/en-us/reference/engine/classes). It does not copy API facts into model prompts or rely on a bundled snapshot. The dashboard links to the matching [Creator Hub class page](https://create.roblox.com/docs/reference/engine/classes) and exposes the raw upstream file for inspection.

## Dashboard API

- `GET /api/engine/catalog` returns a curated set of common classes across world, scripting, input, networking, persistence, UI, assets, and gameplay.
- `GET /api/engine/class?name=Workspace` fetches current class summary, ancestry, properties, methods, events, and callbacks when present.
- Add `&q=CurrentCamera` to filter members by name, type, or summary.

The catalog is a starting point, not the complete Roblox API. Any class name that matches the safe class-name format can be requested. The class data is read from Roblox's generated YAML. The Lab presents summarized member metadata and direct official source links; the Creator Hub page contains full descriptions, parameters, code samples, and engine usage notes.

## Request and cache limits

- Outbound reference reads target only `raw.githubusercontent.com/Roblox/creator-docs`.
- Each request has an 8 second timeout and a 1 MiB response ceiling.
- At most 24 class documents are cached in memory for five minutes.
- Requests are read-only; no Roblox account, Studio place, credentials, or Open Cloud permission are used.
- Missing classes, malformed upstream content, timeouts, and network errors are surfaced as errors rather than replaced with sample API data.

## Architecture inspection

Reference lookup answers engine questions. Inspecting an existing experience is a separate live workflow: the official Studio MCP server must be enabled in Studio and connected to Codex before the Lab can read its DataModel, scripts, console, or viewport. A Studio process being open does not count as a successful connection.
