import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLabServer } from '../src/server/app.js';
import { LABKIT_SOURCE, listTemplates, resolveTemplate } from '../src/services/project-templates.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const labkitRoot = path.join(repositoryRoot, 'roblox', 'packages', 'labkit');

const REQUIRED_MODULES = [
  'Signal', 'Trove', 'Schema', 'RateLimiter', 'Retry', 'Net', 'PlayerData', 'Economy',
  'Receipts', 'Inventory', 'StateMachine', 'Rng', 'LootTable', 'Spring', 'Theme', 'Create',
];

async function withServer(run) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), '11vated-lab-template-'));
  await fs.mkdir(path.join(rootDir, 'evidence'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'evidence', 'registry.json'), JSON.stringify({ schemaVersion: 1, updatedAt: '2026-11-12T00:00:00Z', records: [] }));
  const studioClient = { getStatus: () => ({ state: 'disconnected', connected: false, tools: [] }), listStudios: async () => [], close: async () => {} };
  const server = createLabServer({ rootDir, studioClient });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run({ baseUrl: `http://127.0.0.1:${server.address().port}`, rootDir });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

test('LabKit exposes every production module from init.luau and each module has a source file', async () => {
  const init = await fs.readFile(path.join(LABKIT_SOURCE, 'init.luau'), 'utf8');
  assert.match(init, /version = "\d+\.\d+\.\d+"/);
  for (const name of REQUIRED_MODULES) {
    assert.match(init, new RegExp(`${name} = require\\(script\\.${name}\\)`), `init.luau must export ${name}`);
    const source = await fs.readFile(path.join(LABKIT_SOURCE, `${name}.luau`), 'utf8');
    assert.match(source, /^--!strict/, `${name} must opt into strict mode`);
    assert.match(source, new RegExp(`return ${name}\\s*$`), `${name} must return its module table`);
  }
});

test('LabKit sibling requires work under both Roblox instances and the Luau CLI', async () => {
  for (const name of REQUIRED_MODULES) {
    const source = await fs.readFile(path.join(LABKIT_SOURCE, `${name}.luau`), 'utf8');
    const requires = source.match(/require\(/g) ?? [];
    if (requires.length === 0) continue;
    assert.match(source, /if script ~= nil then\s+return require\(script\.Parent\[name\]\)\s+end\s+return require\("\.\/" \.\. name\)/, `${name} must use the dual-mode import helper`);
  }
});

test('LabKit and the production template ship Roblox-free CLI specs', async () => {
  const labkitSpecs = (await fs.readdir(path.join(labkitRoot, 'tests'))).filter((name) => name.endsWith('.cli.spec.luau'));
  assert.ok(labkitSpecs.length >= 4, 'LabKit must ship at least four CLI spec suites');
  const templateSpecs = (await fs.readdir(path.join(repositoryRoot, 'roblox', 'templates', 'production', 'tests'))).filter((name) => name.endsWith('.cli.spec.luau'));
  assert.ok(templateSpecs.length >= 1);
  const runner = await fs.readFile(path.join(repositoryRoot, 'scripts', 'run-luau-specs.ps1'), 'utf8');
  assert.match(runner, /roblox/, 'the pinned spec runner must include roblox/ packages and templates');
  const suite = await fs.readFile(path.join(repositoryRoot, 'scripts', 'test-all.ps1'), 'utf8');
  assert.match(suite, /run-luau-specs\.ps1/, 'the offline suite must execute Luau CLI specs');
});

test('template registry is closed and rejects unknown template IDs', () => {
  assert.deepEqual(listTemplates().map((template) => template.id).sort(), ['base', 'production']);
  assert.equal(resolveTemplate('production').vendorLabKit, true);
  assert.throws(() => resolveTemplate('../base'), { code: 'INVALID_PROJECT_TEMPLATE' });
  assert.throws(() => resolveTemplate('constructor'), { code: 'INVALID_PROJECT_TEMPLATE' });
});

test('creating a production project vendors a hashed LabKit copy and repoints the Rojo tree', async () => {
  await withServer(async ({ baseUrl, rootDir }) => {
    const templates = await (await fetch(`${baseUrl}/api/templates`)).json();
    assert.ok(templates.templates.some((template) => template.id === 'production' && template.includesLabKit));

    const rejected = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ name: 'bad-template', template: 'nope' }),
    });
    assert.equal(rejected.status, 400);
    assert.equal(await fs.stat(path.join(rootDir, 'projects', 'bad-template')).then(() => true, () => false), false);

    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ name: 'orb-tycoon', displayName: 'Orb Tycoon', template: 'production' }),
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.project.template, 'roblox-production');
    assert.match(body.project.labkitVersion, /^\d+\.\d+\.\d+$/);

    const projectRoot = path.join(rootDir, 'projects', 'orb-tycoon');
    const projectJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'default.project.json'), 'utf8'));
    assert.equal(projectJson.tree.ReplicatedStorage.Packages.LabKit.$path, 'Packages/LabKit');
    const lock = JSON.parse(await fs.readFile(path.join(projectRoot, 'Packages', 'labkit.lock.json'), 'utf8'));
    assert.equal(lock.version, body.project.labkitVersion);
    for (const name of REQUIRED_MODULES) {
      const bytes = await fs.readFile(path.join(projectRoot, 'Packages', 'LabKit', `${name}.luau`));
      assert.equal(lock.files[`${name}.luau`], createHash('sha256').update(bytes).digest('hex'), `${name} hash recorded`);
    }
    assert.ok(lock.files['init.luau']);
    const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, 'lab.project.json'), 'utf8'));
    assert.equal(manifest.template, 'roblox-production');
    await fs.access(path.join(projectRoot, 'tests', 'rules.cli.spec.luau'));
    await fs.access(path.join(projectRoot, 'src', 'server', 'DataService.luau'));

    const inspected = await (await fetch(`${baseUrl}/api/projects/orb-tycoon`)).json();
    assert.equal(inspected.project.state, 'ready', JSON.stringify(inspected.project.diagnostics ?? inspected));
  });
});

test('production template keeps currency authority on the server and never trusts client positions', async () => {
  const server = await fs.readFile(path.join(repositoryRoot, 'roblox', 'templates', 'production', 'src', 'server', 'GameService.luau'), 'utf8');
  const remotes = await fs.readFile(path.join(repositoryRoot, 'roblox', 'templates', 'production', 'src', 'shared', 'Remotes.luau'), 'utf8');
  const client = await fs.readFile(path.join(repositoryRoot, 'roblox', 'templates', 'production', 'src', 'client', 'Hud.client.luau'), 'utf8');
  assert.doesNotMatch(remotes, /Collect|Grant|AddCoins/i, 'no client remote may award currency');
  assert.match(server, /RunService\.Heartbeat:Connect/, 'collection is driven by a server-side pickup scan');
  assert.match(server, /local rootPosition = root\.Position/, 'pickup uses the server-side character position');
  assert.match(server, /Rules\.canCollect\(GameConfig, profile\.Data, rootPosition/, 'server validates the pickup radius before granting');
  assert.doesNotMatch(client, /wallet|economy:grant|DataStore/i, 'client code does not touch the wallet or persistence');
  const data = await fs.readFile(path.join(repositoryRoot, 'roblox', 'templates', 'production', 'src', 'server', 'DataService.luau'), 'utf8');
  assert.match(data, /BindToClose/, 'profiles are released on shutdown');
  assert.match(data, /session_lost/, 'session loss kicks the player');
});
