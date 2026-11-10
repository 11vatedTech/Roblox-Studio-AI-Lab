import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLabServer } from '../src/server/app.js';
import {
  createProjectManifest,
  inspectProject,
  readProjectManifest,
  recoverProject,
  updateProjectSettings,
} from '../src/services/project-store.js';

async function withRoot(run) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), '11vated-project-'));
  try {
    await run(rootDir);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

async function makeProject(rootDir, name, { manifest = true } = {}) {
  const projectRoot = path.join(rootDir, 'projects', name);
  await fs.mkdir(path.join(projectRoot, 'src', 'server'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'src', 'client'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'src', 'shared'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'default.project.json'), JSON.stringify({ name, tree: { $className: 'DataModel' } }));
  if (manifest) await createProjectManifest(projectRoot, { name });
  return projectRoot;
}

async function withServer(rootDir, run) {
  const server = createLabServer({
    rootDir,
    studioClient: { getStatus: () => ({ state: 'disconnected', connected: false, tools: [] }), listStudios: async () => [], close: async () => {} },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

test('inspection reports a persistent identity, revision, and ready state for a complete project', async () => {
  await withRoot(async (rootDir) => {
    await makeProject(rootDir, 'alpha-world');
    const inspection = await inspectProject(rootDir, 'alpha-world');
    assert.equal(inspection.state, 'ready');
    assert.equal(inspection.manifestStatus, 'ok');
    assert.match(inspection.manifest.projectId, /^[0-9a-f-]{36}$/i);
    assert.equal(inspection.manifest.revision, 1);
    assert.deepEqual(inspection.manifest.settings, { maxPlayers: 8, targetDevice: 'all', genre: '', notes: '' });
    assert.equal(inspection.structure.ok, true);
    assert.equal(inspection.sourceFiles, 0);
    assert.deepEqual(inspection.interruptedOperations, []);
  });
});

test('inspection classifies missing, corrupted, incompatible, and incomplete project states without silently repairing them', async () => {
  await withRoot(async (rootDir) => {
    await makeProject(rootDir, 'no-manifest', { manifest: false });
    assert.equal((await inspectProject(rootDir, 'no-manifest')).state, 'unregistered');

    const corruptedRoot = await makeProject(rootDir, 'corrupted-world');
    await fs.writeFile(path.join(corruptedRoot, 'lab.project.json'), '{ not json');
    const corrupted = await inspectProject(rootDir, 'corrupted-world');
    assert.equal(corrupted.state, 'corrupted');
    assert.equal(corrupted.manifest, null);
    assert.match(corrupted.diagnostics.join(' '), /not valid JSON/);

    const futureRoot = await makeProject(rootDir, 'future-world');
    await fs.writeFile(path.join(futureRoot, 'lab.project.json'), JSON.stringify({ schemaVersion: 2, name: 'future-world' }));
    assert.equal((await inspectProject(rootDir, 'future-world')).state, 'incompatible');

    const incompleteRoot = path.join(rootDir, 'projects', 'incomplete-world');
    await fs.mkdir(incompleteRoot, { recursive: true });
    await createProjectManifest(incompleteRoot, { name: 'incomplete-world' });
    const incomplete = await inspectProject(rootDir, 'incomplete-world');
    assert.equal(incomplete.state, 'incomplete');
    assert.deepEqual(incomplete.structure.issues.map((issue) => issue.path).sort(), ['default.project.json', 'src/client', 'src/server', 'src/shared']);
  });
});

test('rebuilding an unreadable manifest preserves the original bytes and issues a new identity', async () => {
  await withRoot(async (rootDir) => {
    const projectRoot = await makeProject(rootDir, 'repair-world');
    await fs.writeFile(path.join(projectRoot, 'lab.project.json'), '{ broken manifest');
    const first = await inspectProject(rootDir, 'repair-world');
    const recovery = await recoverProject(rootDir, 'repair-world', { actions: ['rebuild-manifest'] });
    assert.equal(recovery.project.state, 'ready');
    assert.equal(recovery.preserved.length, 1);
    assert.equal(await fs.readFile(path.join(rootDir, recovery.preserved[0]), 'utf8'), '{ broken manifest');
    const rebuilt = await readProjectManifest(projectRoot, { expectedName: 'repair-world' });
    assert.equal(rebuilt.status, 'ok');
    assert.notEqual(rebuilt.manifest.projectId, null);
    assert.equal(rebuilt.manifest.recoveredFrom, 'invalid');
    assert.notEqual(recovery.project.manifest.projectId, first.manifest?.projectId ?? null);
    await assert.rejects(
      recoverProject(rootDir, 'repair-world', { actions: ['rebuild-manifest'] }),
      (error) => error.code === 'PROJECT_MANIFEST_ALREADY_VALID' && error.status === 409,
    );
  });
});

test('a newer manifest schema is never downgraded by recovery', async () => {
  await withRoot(async (rootDir) => {
    const projectRoot = await makeProject(rootDir, 'future-schema');
    await fs.writeFile(path.join(projectRoot, 'lab.project.json'), JSON.stringify({ schemaVersion: 2, name: 'future-schema' }));
    await assert.rejects(
      recoverProject(rootDir, 'future-schema', { actions: ['rebuild-manifest'] }),
      (error) => error.code === 'PROJECT_SCHEMA_UNSUPPORTED',
    );
    assert.equal(JSON.parse(await fs.readFile(path.join(projectRoot, 'lab.project.json'), 'utf8')).schemaVersion, 2);
  });
});

test('stale staging output is detected and removable while a fresh operation is refused', async () => {
  await withRoot(async (rootDir) => {
    await makeProject(rootDir, 'staged-world');
    const projectsRoot = path.join(rootDir, 'projects');
    const stale = path.join(projectsRoot, '.staged-world.staging-111-222');
    await fs.mkdir(stale, { recursive: true });
    const old = new Date(Date.now() - 5 * 60_000);
    await fs.utimes(stale, old, old);
    const inspection = await inspectProject(rootDir, 'staged-world');
    assert.equal(inspection.state, 'interrupted');
    assert.equal(inspection.interruptedOperations.length, 1);
    const removal = await recoverProject(rootDir, 'staged-world', { actions: ['remove-staging'] });
    assert.equal(removal.project.state, 'ready');
    assert.equal(await fs.stat(stale).then(() => true, () => false), false);

    const fresh = path.join(projectsRoot, '.staged-world.staging-333-444');
    await fs.mkdir(fresh, { recursive: true });
    await assert.rejects(
      recoverProject(rootDir, 'staged-world', { actions: ['remove-staging'] }),
      (error) => error.code === 'PROJECT_OPERATION_IN_PROGRESS' && error.status === 409,
    );
    assert.equal(await fs.stat(fresh).then(() => true, () => false), true);
  });
});

test('settings updates are bounded, revision-checked, and persisted with a new revision', async () => {
  await withRoot(async (rootDir) => {
    await makeProject(rootDir, 'settings-world');
    const updated = await updateProjectSettings(rootDir, 'settings-world', { expectedRevision: 1, settings: { maxPlayers: 24, targetDevice: 'mobile' } });
    assert.equal(updated.manifest.revision, 2);
    assert.equal(updated.manifest.settings.maxPlayers, 24);
    assert.equal(updated.manifest.settings.targetDevice, 'mobile');
    assert.equal(updated.manifest.settings.genre, '');

    await assert.rejects(
      updateProjectSettings(rootDir, 'settings-world', { expectedRevision: 1, settings: { notes: 'stale' } }),
      (error) => error.code === 'PROJECT_REVISION_CONFLICT' && error.status === 409,
    );
    await assert.rejects(
      updateProjectSettings(rootDir, 'settings-world', { settings: { maxPlayers: 0 } }),
      (error) => error.code === 'INVALID_PROJECT_SETTINGS',
    );
    await assert.rejects(
      updateProjectSettings(rootDir, 'settings-world', { settings: { arbitrary: true } }),
      (error) => error.code === 'INVALID_PROJECT_SETTINGS',
    );
    assert.equal((await inspectProject(rootDir, 'settings-world')).manifest.revision, 2);
  });
});

test('rejects unsafe project names and symlinked project directories', async (t) => {
  await withRoot(async (rootDir) => {
    await assert.rejects(inspectProject(rootDir, '../outside'), (error) => error.code === 'INVALID_PROJECT_NAME');
    const projectsRoot = path.join(rootDir, 'projects');
    await fs.mkdir(projectsRoot, { recursive: true });
    const target = await makeProject(rootDir, 'link-target');
    const linkPath = path.join(projectsRoot, 'link-alias');
    try {
      await fs.symlink(target, linkPath, 'junction');
    } catch (error) {
      if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) return t.skip('Creating a local link requires privileges on this workstation.');
      throw error;
    }
    await assert.rejects(inspectProject(rootDir, 'link-alias'), (error) => error.code === 'PROJECT_PATH_INVALID');
  });
});

test('project identity and settings survive a service restart on the same workspace', async () => {
  await withRoot(async (rootDir) => {
    await fs.mkdir(path.join(rootDir, 'projects'), { recursive: true });
    await withServer(rootDir, async (baseUrl) => {
      const created = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: baseUrl },
        body: JSON.stringify({ name: 'restart-world', displayName: 'Restart World' }),
      });
      assert.equal(created.status, 201);
      const body = await created.json();
      assert.match(body.project.projectId, /^[0-9a-f-]{36}$/i);
      assert.equal(body.project.revision, 1);
    });

    let projectId;
    await withServer(rootDir, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/projects/restart-world`);
      assert.equal(response.status, 200);
      const { project } = await response.json();
      projectId = project.manifest.projectId;
      assert.equal(project.state, 'ready');
      assert.equal(project.manifest.displayName, 'Restart World');
      assert.ok(project.sourceFiles >= 1, 'the created project should contain template Luau sources');
      const patch = await fetch(`${baseUrl}/api/projects/restart-world`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', origin: baseUrl },
        body: JSON.stringify({ expectedRevision: 1, settings: { genre: 'co-op survival' } }),
      });
      assert.equal(patch.status, 200);
      assert.equal((await patch.json()).project.manifest.revision, 2);
    });

    await withServer(rootDir, async (baseUrl) => {
      const { project } = await (await fetch(`${baseUrl}/api/projects/restart-world`)).json();
      assert.equal(project.manifest.projectId, projectId);
      assert.equal(project.manifest.revision, 2);
      assert.equal(project.manifest.settings.genre, 'co-op survival');
      const listing = await (await fetch(`${baseUrl}/api/projects`)).json();
      assert.equal(listing.projects[0].projectId, projectId);
    });
  });
});

test('recovery and settings routes reject malformed requests and cross-origin mutations', async () => {
  await withRoot(async (rootDir) => {
    await makeProject(rootDir, 'route-world');
    await withServer(rootDir, async (baseUrl) => {
      const unknownAction = await fetch(`${baseUrl}/api/projects/route-world/recover`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: baseUrl },
        body: JSON.stringify({ actions: ['delete-everything'] }),
      });
      assert.equal(unknownAction.status, 400);
      assert.equal((await unknownAction.json()).error.code, 'INVALID_RECOVERY_ACTIONS');

      const crossOrigin = await fetch(`${baseUrl}/api/projects/route-world`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
        body: JSON.stringify({ settings: { notes: 'blocked' } }),
      });
      assert.equal(crossOrigin.status, 403);

      const missing = await fetch(`${baseUrl}/api/projects/absent-world`);
      assert.equal(missing.status, 404);
      assert.equal((await missing.json()).error.code, 'PROJECT_NOT_FOUND');
    });
  });
});
