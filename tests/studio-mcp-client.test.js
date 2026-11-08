import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMinimalChildEnvironment, StudioMcpClient } from '../src/services/studio-mcp-client.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('initializes the official MCP stdio contract and discovers a real Studio instance', async () => {
  const client = new StudioMcpClient({ command: process.execPath, args: [path.join(here, 'fixtures', 'studio-mcp-server.js')] });
  try {
    const status = await client.connect();
    assert.equal(status.state, 'connected');
    assert.ok(status.tools.includes('list_roblox_studios'));
    assert.deepEqual(await client.listStudios(), [{ studio_id: 'fixture-studio', name: 'Fixture Place', place_id: null }]);
    const inventory = client.getToolInventory();
    assert.equal(inventory.discoveredToolCount, 3);
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
