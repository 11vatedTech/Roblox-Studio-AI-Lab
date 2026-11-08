# Lab specialist execution

The Lab Tasks MCP server connects AI clients to approved specialist tasks. It implements the MCP stdio transport and exposes only named task operations; it does not launch a model, run arbitrary commands, invoke arbitrary MCP tools, or change a Roblox Studio place.

## Connect an AI client

Add one local MCP server entry to an AI client that supports stdio MCP. Replace the paths with the absolute path to this repository:

```json
{
  "mcpServers": {
    "11vatedtech-lab-tasks": {
      "command": "node",
      "args": ["C:\\path\\to\\ai-Roblox-studio-lab\\src\\mcp\\lab-task-server.js"],
      "env": {
        "LAB_WORKSPACE_ROOT": "C:\\path\\to\\ai-Roblox-studio-lab"
      }
    }
  }
}
```

The MCP host starts one server process for each connection. The Lab records the actual local MCP server process ID, parent process ID, and a process-scoped session ID. The MCP client's name and version come from its `initialize` message and are self-reported. Evidence does not claim to authenticate a person, AI provider, or model.

## Run an assigned task

1. Start the Lab and create a task in the Agent Workbench. The task must declare its specialist, independent reviewer, artifact types, and exact project-relative read and write paths.
2. Approve the proposed task in the workbench. The assigned owner uses `lab_task_queue` to find it and `lab_task_claim` with the exact owner ID.
3. The owner reads declared inputs with `lab_task_read`, stages outputs with `lab_task_write`, and calls `lab_task_submit` when every contracted artifact type is present. The owner should call `lab_task_heartbeat` while holding a claim for extended work.
4. Connect the assigned reviewer through a separate MCP server process. The reviewer claims the submitted task with its assigned reviewer ID, reads declared inputs and staged outputs, and runs `lab_task_validate`. The reviewer then uses `lab_task_review` to accept or reject with a concise reason.
5. Acceptance rechecks output hashes and the source versions observed when work began. It integrates the staged files into the project and writes the reviewer process details, fixed-check results, output hashes, and identity limits under `evidence/task-executions/`.
6. A rejection returns the task to the owner for another attempt and preserves staged files for correction. The workbench shows task state, attempt count, active role and process, and the latest validation status.

For `.lua`/`.luau` outputs and project source changes under `src/`, the reviewer must run the fixed checks against a temporary copy of the project with staged outputs overlaid. The Lab uses the pinned Luau 0.745 parser, runs up to 200 project `*.cli.spec.luau` files within a bounded time budget, and builds the staged snapshot with the pinned Rojo 7.7.1 binary. It removes the temporary snapshot after recording hashes and results. Engine-dependent specs, actual Studio playtests, device profiles, and published-place behavior are not certified by these local checks.

## Recovery and limits

- A claim expires after five minutes without a task operation. Heartbeats extend the lease.
- `lab_task_recover_stale` revokes expired claims and blocks the task. The operator must explicitly resume the blocked task before another owner can claim it.
- The operator can stop an active task in the workbench; stopping revokes its claim and records a reason.
- Conflicting write paths are reserved while a task is in progress or review. Reviewer acceptance also checks the original file hashes and will not overwrite changed project files.
- Each task output is bounded to 512 KiB of UTF-8 text. Output paths must exactly match declared write ownership. Files remain under the project until reviewer acceptance.
- Different MCP server process and session IDs are required for review. If the same desktop application hosts both connections, the processes may still share a parent application; the evidence records that fact and does not claim independent providers or people.
- Project contents and task instructions are supplied to the connected AI client. The Lab itself sends no project data to an AI service; the MCP host's model and privacy settings determine where its prompts are processed.
- Roblox Studio MCP remains a separate connection. This task server cannot mutate the Studio DataModel, enable Open Cloud access, upload assets, publish, purchase, change account permissions, or write production data.

The stdio transport and tool messages follow the [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), [stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), and [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) specification pages.
