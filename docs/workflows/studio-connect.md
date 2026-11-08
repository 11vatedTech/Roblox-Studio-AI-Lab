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

The dashboard's bridge calls only `list_roblox_studios`, `get_studio_state`, `get_console_output`, `search_game_tree`, `inspect_instance`, `script_read`, `script_search`, `script_grep`, `screen_capture`, `http_get`, and `skill`, using named routes with validated inputs. The live inventory may report additional server tools, but they remain blocked by the dashboard and are not assigned a guessed risk class. ChatGPT's official plugin has broader editing and playtest tools; review each in the prompt and leave Open Cloud scopes disabled unless a specific authorized task needs them.

Roblox references:

- [Connect to the Roblox Studio MCP server](https://create.roblox.com/docs/studio/mcp)
- [Use Open Cloud with the Studio MCP server](https://create.roblox.com/docs/studio/mcp-open-cloud)
- [Roblox's official assistant plugin](https://github.com/Roblox/roblox-studio-agent-plugin)
