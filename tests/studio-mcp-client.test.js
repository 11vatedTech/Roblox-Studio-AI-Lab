import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMinimalChildEnvironment, StudioMcpClient } from '../src/services/studio-mcp-client.js';
import {
  SANDBOX_DELETE_CODE,
  SANDBOX_DEVICE_RESET_CODE,
  SANDBOX_DEVICE_SELECT_CODE,
  SANDBOX_PLAYER_COUNT_CODE,
  SANDBOX_PROBE_V1,
  SANDBOX_PROBE_V2,
  SANDBOX_SCRIPT_CLASS,
  SANDBOX_SCRIPT_PATH,
  SANDBOX_UPLOAD_IMAGE_RELATIVE,
} from '../src/services/studio-sandbox-operations.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('initializes the official MCP stdio contract and discovers a real Studio instance', async () => {
  const client = new StudioMcpClient({ command: process.execPath, args: [path.join(here, 'fixtures', 'studio-mcp-server.js')] });
  try {
    const status = await client.connect();
    assert.equal(status.state, 'connected');
    assert.ok(status.tools.includes('list_roblox_studios'));
    assert.deepEqual(await client.listStudios(), [{ studio_id: 'fixture-studio', name: 'Fixture Place', place_id: null }]);
    const inventory = client.getToolInventory();
    assert.equal(inventory.discoveredToolCount, 6);
    assert.ok(inventory.discoveredAt);
    const list = inventory.tools.find((tool) => tool.name === 'list_roblox_studios');
    assert.equal(list.operationClass, 'read_only');
    assert.equal(list.dashboardCallable, true);
    assert.equal(list.inputSchema.properties instanceof Object, true);
    const execute = inventory.tools.find((tool) => tool.name === 'execute_luau');
    assert.equal(execute.available, true);
    assert.equal(execute.dashboardCallable, false);
    assert.equal(execute.operationClass, 'unclassified');
    assert.match(execute.restriction, /not exposed through the Lab dashboard/i);
  } finally {
    await client.close();
  }
});

test('does not expose tools outside the explicit read-only allowlist', async () => {
  const client = new StudioMcpClient({ command: process.execPath, args: [path.join(here, 'fixtures', 'studio-mcp-server.js')] });
  try {
    await client.connect();
    await assert.rejects(() => client.callReadTool('execute_luau', { studio_id: 'fixture-studio', code: 'return true' }), { code: 'STUDIO_TOOL_NOT_ALLOWED' });
    // These are read-only in Studio, but the Lab has no named route for them.
    await assert.rejects(() => client.callReadTool('script_search', { studio_id: 'fixture-studio', query: 'x' }), { code: 'STUDIO_TOOL_NOT_ALLOWED' });
    await assert.rejects(() => client.callReadTool('script_grep', { studio_id: 'fixture-studio', pattern: 'x' }), { code: 'STUDIO_TOOL_NOT_ALLOWED' });
    await assert.rejects(() => client.callReadTool('http_get', { url: 'https://example.com' }), { code: 'STUDIO_TOOL_NOT_ALLOWED' });
    await assert.rejects(() => client.callReadTool('skill', { name: 'x' }), { code: 'STUDIO_TOOL_NOT_ALLOWED' });
  } finally {
    await client.close();
  }
});

test('allows only the fixed playtest and sealed sandbox mutations with exact bounded arguments', async () => {
  const client = new StudioMcpClient({ command: process.execPath, args: [path.join(here, 'fixtures', 'studio-mcp-server.js')] });
  try {
    await client.connect();
    const mutation = await client.callMutationTool('start_stop_play', { studio_id: 'fixture-studio', is_start: true });
    const payload = JSON.parse(mutation.content[0].text);
    assert.equal(payload.ok, true);
    assert.equal(payload.arguments.is_start, true);
    assert.equal(payload.arguments.studio_id, 'fixture-studio');

    const created = await client.callMutationTool('multi_edit', {
      className: SANDBOX_SCRIPT_CLASS,
      datamodel_type: 'Edit',
      edits: [{ old_string: '', new_string: SANDBOX_PROBE_V1 }],
      file_path: SANDBOX_SCRIPT_PATH,
      studio_id: 'fixture-studio',
    });
    assert.equal(JSON.parse(created.content[0].text).ok, true);
    const replaced = await client.callMutationTool('multi_edit', {
      datamodel_type: 'Edit',
      edits: [{ old_string: SANDBOX_PROBE_V1, new_string: SANDBOX_PROBE_V2 }],
      file_path: SANDBOX_SCRIPT_PATH,
      studio_id: 'fixture-studio',
    });
    assert.equal(JSON.parse(replaced.content[0].text).ok, true);
    const deleted = await client.callMutationTool('execute_luau', {
      code: SANDBOX_DELETE_CODE,
      datamodel_type: 'Edit',
      studio_id: 'fixture-studio',
    });
    assert.equal(JSON.parse(deleted.content[0].text).ok, true);
    const uploaded = await client.callMutationTool('upload_image', {
      imagePaths: [path.resolve(SANDBOX_UPLOAD_IMAGE_RELATIVE)],
      studio_id: 'fixture-studio',
    });
    assert.equal(JSON.parse(uploaded.content[0].text).ok, true);
    const device = await client.callSandboxLuau('select_device', 'fixture-studio');
    assert.equal(JSON.parse(device.content[0].text).arguments.code, SANDBOX_DEVICE_SELECT_CODE);
    const reset = await client.callSandboxLuau('reset_device', 'fixture-studio');
    assert.equal(JSON.parse(reset.content[0].text).arguments.code, SANDBOX_DEVICE_RESET_CODE);
    const serverPlayers = await client.callSandboxLuau('count_players_server', 'fixture-studio');
    assert.equal(JSON.parse(serverPlayers.content[0].text).arguments.datamodel_type, 'Server');
    assert.equal(JSON.parse(serverPlayers.content[0].text).arguments.code, SANDBOX_PLAYER_COUNT_CODE);
    const clientPlayers = await client.callSandboxLuau('count_players_client', 'fixture-studio');
    assert.equal(JSON.parse(clientPlayers.content[0].text).arguments.datamodel_type, 'Client');

    await assert.rejects(() => client.callMutationTool('execute_luau', { studio_id: 'fixture-studio', code: 'return true', datamodel_type: 'Edit' }), { code: 'STUDIO_MUTATION_ARGUMENTS_INVALID' });
    await assert.rejects(() => client.callMutationTool('execute_luau', { studio_id: 'fixture-studio', code: SANDBOX_DEVICE_SELECT_CODE, datamodel_type: 'Server' }), { code: 'STUDIO_MUTATION_ARGUMENTS_INVALID' });
    await assert.rejects(() => client.callSandboxLuau('not_registered', 'fixture-studio'), { code: 'STUDIO_SANDBOX_LUAU_INVALID' });
    await assert.rejects(() => client.callMutationTool('multi_edit', { className: SANDBOX_SCRIPT_CLASS, datamodel_type: 'Edit', edits: [{ old_string: '', new_string: 'return true' }], file_path: SANDBOX_SCRIPT_PATH, studio_id: 'fixture-studio' }), { code: 'STUDIO_MUTATION_ARGUMENTS_INVALID' });
    await assert.rejects(() => client.callMutationTool('multi_edit', { className: SANDBOX_SCRIPT_CLASS, datamodel_type: 'Edit', edits: [{ old_string: '', new_string: SANDBOX_PROBE_V1 }], file_path: 'game.ServerScriptService.Other', studio_id: 'fixture-studio' }), { code: 'STUDIO_MUTATION_ARGUMENTS_INVALID' });
    await assert.rejects(() => client.callMutationTool('upload_image', { imagePaths: ['C:\\Windows\\win.ini'], studio_id: 'fixture-studio' }), { code: 'STUDIO_MUTATION_ARGUMENTS_INVALID' });
    await assert.rejects(() => client.callMutationTool('start_stop_play', { studio_id: 'fixture-studio', is_start: 'yes' }), { code: 'STUDIO_MUTATION_ARGUMENTS_INVALID' });
    await assert.rejects(() => client.callMutationTool('start_stop_play', { studio_id: 'fixture-studio', is_start: true, code: 'return true' }), { code: 'STUDIO_MUTATION_ARGUMENTS_INVALID' });
    await assert.rejects(() => client.callReadTool('start_stop_play', { studio_id: 'fixture-studio', is_start: true }), { code: 'STUDIO_TOOL_NOT_ALLOWED' });
  } finally {
    await client.close();
  }
});

test('uses the stateless MCP protocol when the server advertises the current version', async () => {
  const client = new StudioMcpClient({ command: process.execPath, args: [path.join(here, 'fixtures', 'studio-mcp-modern-server.js')] });
  try {
    const status = await client.connect();
    assert.equal(status.protocolEra, 'modern');
    assert.equal(status.protocolVersion, '2026-07-28');
    assert.deepEqual(await client.listStudios(), [{ studio_id: 'modern-studio', name: 'Modern Place', place_id: 77 }]);
  } finally {
    await client.close();
  }
});

test('does not fall back to legacy when modern discovery is delayed past 1.8 seconds', async () => {
  const client = new StudioMcpClient({
    command: process.execPath,
    args: [path.join(here, 'fixtures', 'studio-mcp-delayed-modern-server.js')],
    timeoutMs: 8000,
  });
  try {
    const status = await client.connect();
    assert.equal(status.protocolEra, 'modern');
    assert.equal(status.protocolVersion, '2026-07-28');
  } finally {
    await client.close();
  }
});

test('normalizes the current Studio instance id field to the Lab studio_id contract', async () => {
  const client = new StudioMcpClient({ command: process.execPath, args: [path.join(here, 'fixtures', 'studio-mcp-id-server.js')] });
  try {
    await client.connect();
    assert.deepEqual(await client.listStudios(), [{ studio_id: 'current-studio-id', id: 'current-studio-id', name: 'Current Place.rbxlx' }]);
  } finally {
    await client.close();
  }
});

test('uses the documented Windows MCP launcher command line', { skip: process.platform !== 'win32' }, async () => {
  let invocation;
  const fixture = path.join(here, 'fixtures', 'studio-mcp-server.js');
  const appData = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-mcp-launcher-'));
  await fs.mkdir(path.join(appData, 'Roblox'), { recursive: true });
  await fs.writeFile(path.join(appData, 'Roblox', 'mcp.bat'), '@echo off\n');
  const client = new StudioMcpClient({
    env: { ComSpec: 'cmd.exe', LOCALAPPDATA: appData },
    spawnProcess: (command, args, options) => { invocation = { command, args }; return spawn(process.execPath, [fixture], options); },
  });
  try {
    await client.connect();
    assert.deepEqual(invocation, { command: 'cmd.exe', args: ['/c', 'cd /d %LOCALAPPDATA%\\Roblox && .\\mcp.bat'] });
  } finally {
    await client.close();
    await fs.rm(appData, { recursive: true, force: true });
  }
});

test('passes only the runtime environment needed by the local bridge', () => {
  const childEnv = createMinimalChildEnvironment({
    PATH: 'C:\\Windows\\System32',
    LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
    SYSTEMROOT: 'C:\\Windows',
    API_TOKEN: 'must-not-cross-the-process-boundary',
  });
  assert.deepEqual(childEnv, {
    PATH: 'C:\\Windows\\System32',
    LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
    SYSTEMROOT: 'C:\\Windows',
  });
});
