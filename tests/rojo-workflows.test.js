import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createLabServer } from '../src/server/app.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rojoExecutable = path.join(repositoryRoot, '.tools', 'rojo-7.7.1', process.platform === 'win32' ? 'rojo.exe' : 'rojo');
let pinnedRojoAvailable = false;
try { pinnedRojoAvailable = (await fs.stat(rojoExecutable)).isFile(); } catch { /* the integration test will report its prerequisite */ }

async function withServer(run) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), '11vated-rojo-api-'));
  await fs.mkdir(path.join(rootDir, 'projects', 'test-world'), { recursive: true });
  const server = createLabServer({ rootDir, toolRootDir: repositoryRoot });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try { await run({ rootDir, baseUrl }); }
  finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

test('Rojo inspection reports the pinned CLI and validates the selected project manifest', async (t) => {
  if (!pinnedRojoAvailable) t.skip('Pinned Rojo 7.7.1 is not installed in this workspace.');
  await withServer(async ({ rootDir, baseUrl }) => {
    await fs.writeFile(path.join(rootDir, 'projects', 'test-world', 'default.project.json'), JSON.stringify({
      name: 'TestWorld',
      tree: { $className: 'DataModel', ReplicatedStorage: { $className: 'ReplicatedStorage' } },
    }));

    const response = await fetch(`${baseUrl}/api/projects/test-world/rojo`);
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.project, 'test-world');
    assert.equal(result.manifest.status, 'valid');
    assert.equal(result.rojo.version, '7.7.1');
    assert.equal(result.build.status, 'not_run');
  });
});

test('Rojo build produces a downloadable place and a durable operation record', async (t) => {
  if (!pinnedRojoAvailable) t.skip('Pinned Rojo 7.7.1 is not installed in this workspace.');
  await withServer(async ({ rootDir, baseUrl }) => {
    await fs.mkdir(path.join(rootDir, 'projects', 'test-world', 'src', 'server'), { recursive: true });
    await fs.writeFile(path.join(rootDir, 'projects', 'test-world', 'src', 'server', 'Main.server.luau'), 'print("rojo-snapshot-source")\n');
    await fs.writeFile(path.join(rootDir, 'projects', 'test-world', 'default.project.json'), JSON.stringify({
      name: 'TestWorld',
      tree: {
        $className: 'DataModel',
        ReplicatedStorage: { $className: 'ReplicatedStorage', Marker: { $className: 'Folder' } },
        ServerScriptService: { $className: 'ServerScriptService', Main: { $path: 'src/server/Main.server.luau' } },
      },
    }));

    const arbitraryOptions = await fetch(`${baseUrl}/api/projects/test-world/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ args: ['--plugin', 'outside.rbxm'] }),
    });
    assert.equal(arbitraryOptions.status, 400);
    assert.equal(await fs.stat(path.join(rootDir, '.lab-runtime')).then(() => true, () => false), false);

    const response = await fetch(`${baseUrl}/api/projects/test-world/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: '{}',
    });
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    assert.equal(result.operation.status, 'passed');
    assert.equal(result.operation.rojoVersion, '7.7.1');
    assert.ok(result.operation.output.bytes > 0);
    assert.match(result.operation.output.sha256, /^[a-f0-9]{64}$/);
    assert.match(result.operation.sourceDigest, /^[a-f0-9]{64}$/);
    assert.equal(result.operation.inputBytes > Buffer.byteLength('print("rojo-snapshot-source")\n'), true);
    assert.match(result.operation.id, /^[a-f0-9-]{36}$/);
    assert.match(result.operation.downloadUrl, /^\/api\/builds\/[a-f0-9-]{36}$/);

    const download = await fetch(new URL(result.operation.downloadUrl, baseUrl));
    assert.equal(download.status, 200);
    assert.equal(Number(download.headers.get('content-length')), result.operation.output.bytes);
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.equal(bytes.length, result.operation.output.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), result.operation.output.sha256);
    assert.equal(await fs.readFile(path.join(rootDir, result.operation.output.path)).then((file) => file.length), bytes.length);
    const records = await fs.readdir(path.join(rootDir, '.lab-runtime', 'operations', 'rojo-builds'));
    assert.deepEqual(records, [`${result.operation.id}.json`]);
    const saved = JSON.parse(await fs.readFile(path.join(rootDir, '.lab-runtime', 'operations', 'rojo-builds', records[0]), 'utf8'));
    assert.equal(saved.id, result.operation.id);
    assert.equal(saved.status, 'passed');
    const inspected = await (await fetch(`${baseUrl}/api/projects/test-world/rojo`)).json();
    assert.equal(inspected.build.id, result.operation.id);
    assert.equal(inspected.build.status, 'passed');
  });
});

test('Rojo refuses project manifest paths that escape the selected project', async (t) => {
  if (!pinnedRojoAvailable) t.skip('Pinned Rojo 7.7.1 is not installed in this workspace.');
  await withServer(async ({ rootDir, baseUrl }) => {
    await fs.writeFile(path.join(rootDir, 'projects', 'test-world', 'default.project.json'), JSON.stringify({
      name: 'UnsafeWorld',
      tree: { $path: '../outside' },
    }));
    const response = await fetch(`${baseUrl}/api/projects/test-world/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: '{}',
    });
    const result = await response.json();
    assert.equal(response.status, 422);
    assert.equal(result.error.code, 'ROJO_MANIFEST_INVALID');
    assert.equal(await fs.stat(path.join(rootDir, '.lab-runtime', 'builds')).then(() => true, () => false), false);
    assert.equal(result.operation.status, 'failed');
    assert.equal(result.operation.downloadUrl, null);
    assert.ok(result.operation.failure.message.includes('outside its project folder'));
  });
});
