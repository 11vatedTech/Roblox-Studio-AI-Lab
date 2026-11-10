import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLabServer } from '../src/server/app.js';

async function withServer(run, options = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), '11vated-lab-'));
  await fs.mkdir(path.join(rootDir, 'evidence'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'evidence', 'registry.json'), JSON.stringify({ schemaVersion: 1, updatedAt: '2026-11-08T00:00:00Z', records: [] }));
  const studioClient = options.studioClient ?? {
    getStatus: () => ({ state: 'disconnected', connected: false, tools: [] }),
    listStudios: async () => [],
    close: async () => {},
  };
  const server = createLabServer({ rootDir, studioClient, referenceClient: options.referenceClient, shutdownGraceMs: options.shutdownGraceMs });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run({ baseUrl: `http://127.0.0.1:${address.port}`, rootDir, studioClient, server });
  } finally {
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    else server.closeAllConnections?.();
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

test('health endpoint reports a live local service without exposing environment values', async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.name, '11vatedTech AI Roblox Studio Lab');
    assert.equal(Object.hasOwn(body, 'env'), false);
  });
});

test('local shutdown route responds before gracefully closing the service', async () => {
  await withServer(async ({ baseUrl, server }) => {
    const closed = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Service did not close after the shutdown request.')), 2_000);
      server.once('close', () => { clearTimeout(timeout); resolve(); });
    });
    const denied = await fetch(`${baseUrl}/api/control/shutdown`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
      body: '{}',
    });
    assert.equal(denied.status, 403);
    assert.equal(server.listening, true);
    const response = await fetch(`${baseUrl}/api/control/shutdown`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: '{}',
    });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get('connection'), 'close');
    assert.deepEqual(await response.json(), { status: 'shutting_down' });
    await closed;
    assert.equal(server.listening, false);
  });
});

test('shutdown closes an in-flight local request after the bounded grace period', async () => {
  let markConnectStarted;
  const connectStarted = new Promise((resolve) => { markConnectStarted = resolve; });
  const studioClient = {
    getStatus: () => ({ state: 'connecting', connected: false, tools: [] }),
    connect: async () => { markConnectStarted(); return new Promise(() => {}); },
    close: async () => {},
  };
  await withServer(async ({ baseUrl, server }) => {
    const closed = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Service did not close after the shutdown grace period.')), 2_000);
      server.once('close', () => { clearTimeout(timeout); resolve(); });
    });
    const activeRequest = fetch(`${baseUrl}/api/studio/connect`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: baseUrl }, body: '{}',
    }).catch((error) => error);
    await connectStarted;
    const shutdown = await fetch(`${baseUrl}/api/control/shutdown`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: baseUrl }, body: '{}',
    });
    assert.equal(shutdown.status, 202);
    await closed;
    assert.ok(await activeRequest instanceof Error);
    assert.equal(server.listening, false);
  }, { studioClient, shutdownGraceMs: 25 });
});

test('evidence endpoint returns the validated registry summary without accepting file paths', async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/evidence`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.summary.total, 0);
    const pathQuery = await fetch(`${baseUrl}/api/evidence?path=../../package.json`);
    assert.equal(pathQuery.status, 400);
  });
});

test('Studio status exposes discovered schemas while labeling non-allowlisted tools as unavailable to the dashboard', async () => {
  const studioClient = {
    getStatus: () => ({ state: 'connected', connected: true, tools: ['list_roblox_studios', 'execute_luau'] }),
    getToolInventory: () => ({
      schemaVersion: 1,
      discoveredAt: '2026-11-07T00:00:00.000Z',
      discoveredToolCount: 2,
      reportedEntryCount: 2,
      truncated: false,
      tools: [
        { name: 'list_roblox_studios', available: true, operationClass: 'read_only', dashboardCallable: true, restriction: 'Named route only.', inputSchema: { type: 'object' }, inputSchemaStatus: 'reported' },
        { name: 'execute_luau', available: true, operationClass: 'unclassified', dashboardCallable: false, restriction: 'Discovered but not exposed.', inputSchema: { type: 'object' }, inputSchemaStatus: 'reported' },
      ],
    }),
    close: async () => {},
  };
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/studio`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.toolInventory.discoveredToolCount, 2);
    assert.equal(body.toolInventory.tools.find((tool) => tool.name === 'list_roblox_studios').dashboardCallable, true);
    assert.equal(body.toolInventory.tools.find((tool) => tool.name === 'execute_luau').dashboardCallable, false);
  }, { studioClient });
});

test('projects endpoint lists only directories in the local projects folder', async () => {
  await withServer(async ({ baseUrl, rootDir }) => {
    await fs.mkdir(path.join(rootDir, 'projects', 'existing-world'), { recursive: true });
    await fs.writeFile(path.join(rootDir, 'projects', 'existing-world', 'lab.project.json'), JSON.stringify({ displayName: 'Existing World Showcase' }));
    await fs.writeFile(path.join(rootDir, 'projects', 'notes.txt'), 'not a project directory');
    const response = await fetch(`${baseUrl}/api/projects`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.projects.map((project) => project.name), ['existing-world']);
    assert.equal(body.projects[0].displayName, 'Existing World Showcase');
  });
});

test('project creation rejects invalid names and creates a Rojo template within the project root', async () => {
  await withServer(async ({ baseUrl, rootDir }) => {
    const invalid = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ name: '../outside' }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(await fs.stat(path.join(path.dirname(rootDir), 'outside')).then(() => true, () => false), false);

    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ name: 'new-experience' }),
    });
    const body = await created.json();
    assert.equal(created.status, 201);
    assert.equal(body.project.name, 'new-experience');
    assert.equal(await fs.readFile(path.join(rootDir, 'projects', 'new-experience', 'default.project.json'), 'utf8').then(() => true), true);
    assert.equal(await fs.readFile(path.join(rootDir, 'projects', 'new-experience', 'src', 'server', 'Bootstrap.server.luau'), 'utf8').then((text) => text.includes('RunService:IsServer()')), true);
  });
});

test('opens nested source paths and rejects traversal in the project source route', async () => {
  await withServer(async ({ baseUrl, rootDir }) => {
    const projectRoot = path.join(rootDir, 'projects', 'source-demo');
    await fs.mkdir(path.join(projectRoot, 'src', 'server'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'src', 'server', 'Main.server.luau'), 'print("source route")\n');

    const validUrl = new URL('/api/source', baseUrl);
    validUrl.searchParams.set('project', 'source-demo');
    validUrl.searchParams.set('path', 'src/server/Main.server.luau');
    const valid = await fetch(validUrl);
    const validBody = await valid.json();
    assert.equal(valid.status, 200);
    assert.equal(validBody.path, 'src/server/Main.server.luau');
    assert.match(validBody.content, /source route/);

    const traversalUrl = new URL('/api/source', baseUrl);
    traversalUrl.searchParams.set('project', 'source-demo');
    traversalUrl.searchParams.set('path', '../outside.luau');
    const traversal = await fetch(traversalUrl);
    const traversalBody = await traversal.json();
    assert.equal(traversal.status, 400);
    assert.equal(traversalBody.error.code, 'PATH_OUTSIDE_ROOT');
  });
});

test('rejects cross-origin mutations and does not create a project', async () => {
  await withServer(async ({ baseUrl, rootDir }) => {
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
      body: JSON.stringify({ name: 'blocked-world' }),
    });
    assert.equal(response.status, 403);
    assert.equal(await fs.stat(path.join(rootDir, 'projects', 'blocked-world')).then(() => true, () => false), false);
  });
});

test('reports disconnected Studio honestly and returns real connected instances from the bridge', async () => {
  let connected = false;
  const connectedStatus = { state: 'connected', connected: true, tools: ['list_roblox_studios'] };
  await withServer(async ({ baseUrl }) => {
    const disconnected = await (await fetch(`${baseUrl}/api/studio`)).json();
    assert.equal(disconnected.connection.state, 'disconnected');

    const connect = await fetch(`${baseUrl}/api/studio/connect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: '{}',
    });
    assert.equal(connect.status, 200);
    const studios = await (await fetch(`${baseUrl}/api/studio/instances`)).json();
    assert.deepEqual(studios.instances, [{ studio_id: 'studio-1', name: 'Lab Test Place', place_id: null }]);
  }, {
    studioClient: {
      getStatus: () => connected ? connectedStatus : { state: 'disconnected', connected: false, tools: [] },
      connect: async () => { connected = true; return connectedStatus; },
      listStudios: async () => [{ studio_id: 'studio-1', name: 'Lab Test Place', place_id: null }],
      close: async () => {},
    },
  });
});

test('serves bounded structured knowledge search without accepting file paths', async () => {
  await withServer(async ({ baseUrl, rootDir }) => {
    await fs.mkdir(path.join(rootDir, 'docs', 'game-intelligence', 'records'), { recursive: true });
    const searchUrl = new URL('/api/knowledge', baseUrl);
    searchUrl.searchParams.set('q', 'grapple');
    searchUrl.searchParams.append('kind', 'mechanic');
    searchUrl.searchParams.set('family_id', 'genre.rpg-adventure');
    searchUrl.searchParams.set('mechanic_id', 'mechanic.movement-grapple');
    searchUrl.searchParams.set('platform_state', 'released');
    searchUrl.searchParams.set('maturity', 'L2');
    searchUrl.searchParams.set('limit', '12');
    const response = await fetch(searchUrl);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.matches));
    assert.equal(body.limit, 12);
    assert.equal(body.total, 0);

    const pathQuery = await fetch(`${baseUrl}/api/knowledge?path=../../package.json`);
    assert.equal(pathQuery.status, 400);
    assert.equal((await pathQuery.json()).error.code, 'INVALID_KNOWLEDGE_FILTER');

    const invalidKind = await fetch(`${baseUrl}/api/knowledge?kind=arbitrary-prompt`);
    assert.equal(invalidKind.status, 400);
    assert.equal((await invalidKind.json()).error.code, 'INVALID_KNOWLEDGE_FILTER');

    const invalidLimit = await fetch(`${baseUrl}/api/knowledge?limit=101`);
    assert.equal(invalidLimit.status, 400);
  });
});

test('exposes the official Roblox API class catalog and current class reference', async () => {
  const referenceClient = {
    catalog: () => ({ source: 'Roblox Creator Hub API reference', classes: [{ name: 'Workspace', domain: 'world', url: 'https://create.roblox.com/docs/reference/engine/classes/Workspace' }] }),
    getClass: async (name, search) => ({ class: name, search, source: 'official_roblox_creator_docs', members: { properties: [] } }),
  };
  await withServer(async ({ baseUrl }) => {
    const catalog = await (await fetch(`${baseUrl}/api/engine/catalog`)).json();
    assert.equal(catalog.source, 'Roblox Creator Hub API reference');
    assert.equal(catalog.classes[0].name, 'Workspace');

    const reference = await (await fetch(`${baseUrl}/api/engine/class?name=Workspace&q=gravity`)).json();
    assert.equal(reference.class, 'Workspace');
    assert.equal(reference.search, 'gravity');
    assert.equal(reference.source, 'official_roblox_creator_docs');
  }, { referenceClient });
});

test('maps Lab requests to the live Studio MCP input schemas', async () => {
  const calls = [];
  const studioClient = {
    getStatus: () => ({ state: 'connected', connected: true, tools: ['list_roblox_studios', 'search_game_tree', 'script_read'] }),
    listStudios: async () => [{ studio_id: 'studio-1', name: 'Signal Garden' }],
    callReadTool: async (name, args) => { calls.push({ name, args }); return { content: [] }; },
    close: async () => {},
  };
  await withServer(async ({ baseUrl }) => {
    const tree = await fetch(`${baseUrl}/api/studio/tree?studio_id=studio-1&depth=10&limit=50&datamodel_type=Server&q=relay`);
    assert.equal(tree.status, 200);
    assert.deepEqual(calls[0], { name: 'search_game_tree', args: { studio_id: 'studio-1', max_depth: 10, head_limit: 50, datamodel_type: 'Server', keywords: 'relay' } });

    const inspect = await fetch(`${baseUrl}/api/studio/inspect?studio_id=studio-1&path=Workspace`);
    assert.equal(inspect.status, 200);
    assert.deepEqual(calls[1], { name: 'inspect_instance', args: { studio_id: 'studio-1', path: 'Workspace' } });

    const script = await fetch(`${baseUrl}/api/studio/script?studio_id=studio-1&path=game.ServerScriptService.Main&start_line=3&end_line=12`);
    assert.equal(script.status, 200);
    assert.deepEqual(calls[2], { name: 'script_read', args: {
      studio_id: 'studio-1', target_file: 'game.ServerScriptService.Main', should_read_entire_file: false,
      start_line_one_indexed: 3, end_line_one_indexed_inclusive: 12,
    } });

    const capture = await fetch(`${baseUrl}/api/studio/capture?studio_id=studio-1&camera_position=115%2C65%2C90&look_at_position=0%2C10%2C0`);
    assert.equal(capture.status, 200);
    assert.equal(calls[3].name, 'screen_capture');
    assert.match(calls[3].args.capture_id, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(calls[3].args.camera_position, [115, 65, 90]);
    assert.deepEqual(calls[3].args.look_at_position, [0, 10, 0]);

    const invalidModel = await fetch(`${baseUrl}/api/studio/tree?studio_id=studio-1&datamodel_type=Play`);
    assert.equal(invalidModel.status, 400);
    const invalidVector = await fetch(`${baseUrl}/api/studio/capture?studio_id=studio-1&camera_position=1%2CInfinity%2C3`);
    assert.equal(invalidVector.status, 400);
    assert.equal(calls.length, 4);
  }, { studioClient });
});

test('persists viewport evidence only for a listed live Studio instance and serves the verified image', async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  await withServer(async ({ baseUrl, rootDir }) => {
    await fs.mkdir(path.join(rootDir, 'projects', 'signal-garden'), { recursive: true });
    const capture = {
      studioId: 'studio-1', project: 'signal-garden', framing: { cameraPosition: [115, 65, 90], lookAtPosition: [0, 10, 0] },
      result: { content: [{ type: 'image', mimeType: 'image/png', data: png.toString('base64') }] },
    };
    const response = await fetch(`${baseUrl}/api/captures`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: baseUrl }, body: JSON.stringify(capture),
    });
    assert.equal(response.status, 201);
    const { capture: saved } = await response.json();
    assert.equal(saved.project, 'signal-garden');
    assert.deepEqual(saved.framing, { cameraPosition: [115, 65, 90], lookAtPosition: [0, 10, 0] });
    assert.equal(await fs.readFile(path.join(rootDir, 'evidence', 'studio', saved.imageName)).then((data) => data.equals(png)), true);
    const imageResponse = await fetch(`${baseUrl}${saved.url}`);
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), png);
    const gallery = await (await fetch(`${baseUrl}/api/captures`)).json();
    assert.equal(gallery.captures.length, 1);
    assert.equal(gallery.captures[0].id, saved.id);
  }, {
    studioClient: {
      getStatus: () => ({ state: 'connected', connected: true, tools: ['list_roblox_studios', 'screen_capture'] }),
      listStudios: async () => [{ studio_id: 'studio-1', name: 'Signal Garden Test', place_id: null }],
      close: async () => {},
    },
  });
});

test('serves a real dashboard shell and rejects path traversal', async () => {
  await withServer(async ({ baseUrl }) => {
    const html = await fetch(`${baseUrl}/`).then((response) => response.text());
    assert.match(html, /11vatedTech AI Roblox Studio Lab/);
    assert.match(html, /<main/);
    assert.equal((await fetch(`${baseUrl}/..%5cpackage.json`)).status, 404);
  });
});
