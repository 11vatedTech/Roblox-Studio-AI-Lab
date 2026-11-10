# Connect Roblox Studio

The Lab uses Roblox's built-in Studio MCP server. Roblox documents this as a local stdio server that lets an AI client inspect the DataModel, read or edit scripts, run Luau, and test a place. The available tool list depends on the Studio version; the Lab never assumes every documented tool is enabled.

## Enable the Studio endpoint

1. Open Roblox Studio and load the intended local or unpublished test place.
2. Open Assistant → Settings → MCP Servers. In older builds, use Assistant → … → Manage MCP Servers.
3. Turn on **Enable Studio as MCP server**.
4. For ChatGPT editing tools, use Quick Connect → **ChatGPT (codex)**. Restart ChatGPT or open a new chat if the tools do not load.

## Verify the connection

- In ChatGPT, call `list_roblox_studios`; verify the intended place name and instance ID.
- In the Lab dashboard, choose **Roblox Studio → Connect official MCP**; verify the protocol and instance list.
- Review **Discovered Studio tools**. The Lab retains each server-reported name, description, and bounded input schema, labels the fixed named-route allowlist as read-only, and shows other discovered tools as not exposed and unclassified. Discovery never makes a new tool callable.
- Inspect the DataModel with `search_game_tree` before making changes.
- Do not call the connection verified based only on a process, launcher file, green UI decoration, or config entry.

## Permission boundary

The dashboard's bridge calls only `list_roblox_studios`, `get_studio_state`, `get_console_output`, `search_game_tree`, `inspect_instance`, `script_read`, and `screen_capture`, using named routes with validated inputs. The live inventory may report additional server tools, but they remain blocked by the dashboard and are not assigned a guessed risk class. Four Studio-read-only tools (`http_get`, `script_grep`, `script_search`, and `skill`) are still not exposed because the Lab has no named route for them. ChatGPT's official plugin has broader editing and playtest tools; review each in the prompt and leave Open Cloud scopes disabled unless a specific authorized task needs them.

## Operation risk and approval model

`LAB-STUDIO-002` defines five ordered risk classes in `src/services/studio-governance.js`:

| Class | Examples | Approval |
|---|---|---|
| `inspection` | state, console, tree, instance, script, viewport capture | none |
| `reversible_mutation` | start/stop local playtest, project sync | single-use token |
| `destructive_mutation` | save place, replace script | single-use token |
| `upload` | image, mesh, texture, animation, model upload | single-use token |
| `publishing` | publish place or experience | single-use token |

The catalog is closed. A tool the Studio server reports but the catalog does not name stays unclassified and cannot pass through the gate. Only `inspection` entries are exposed by the dashboard. There is no dashboard mutation route.

A high-impact approval is a single-use token bound to the operation ID, project, source revision, Studio instance ID, place name and ID, and a SHA-256 digest of the operation parameters. Tokens live 15 seconds to 60 minutes, are stored only as SHA-256 hashes, are consumed by the first authorization, and are refused on replay, scope mismatch, or expiry. Approval issuance, authorization, execution start, result, and denial are appended to `.lab-runtime/studio-governance/audit.jsonl` without the token. `GET /api/studio/operations` shows the matrix and a bounded audit tail; it cannot execute anything.

The only registered mutation executor is a fixed CLI for the reversible local playtest operation:

```powershell
npm run studio:playtest -- --action start --project signal-garden --studio <studio-id> --place-name <place.rbxlx> --place-id 0 --revision <full-git-commit>
```

Use `--action stop` for the reverse operation. The CLI connects to the official Studio MCP server, binds the approval to the exact project, revision, Studio instance, and place, and calls only `start_stop_play` with `{ studio_id, is_start }`. It cannot save, upload, publish, replace a script, execute Luau, or invoke an arbitrary tool. Each start or stop needs its own single-use approval; the CLI issues one only for the exact scope it is given. This is a local reversible playtest, not a DataModel sync. Rojo live sync, save, upload, and publish remain blocked.

Roblox references:

- [Connect to the Roblox Studio MCP server](https://create.roblox.com/docs/studio/mcp)
- [Use Open Cloud with the Studio MCP server](https://create.roblox.com/docs/studio/mcp-open-cloud)
- [Roblox's official assistant plugin](https://github.com/Roblox/roblox-studio-agent-plugin)
