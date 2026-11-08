import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadKnowledge, searchKnowledge } from '../src/services/knowledge-store.js';

const RECORDS = ['docs', 'game-intelligence', 'records'];

function makeRecord({
  id,
  kind = id.startsWith('genre.') ? 'game-family' : 'mechanic',
  summary = `Knowledge record for ${id}.`,
  dependencies = [],
  state = 'released',
  maturity = 'L2',
} = {}) {
  return {
    id,
    kind,
    version: '1.0.0',
    summary,
    designKnowledge: { playerExperience: `Design notes for ${id}.` },
    technicalPatterns: [{ name: `${id} pattern`, guidance: 'Validate the server owned transition and its observable result.' }],
    dependencies,
    conflicts: [],
    failureModes: [{ id: 'missing-feedback', description: 'Players cannot tell that the action completed.', mitigation: 'Expose a clear state change and repeatable check.' }],
    testing: {
      scenarios: [{ id: 'basic-path', action: 'Run the mechanic once in a local test.', expected: 'The server records one valid state transition.' }],
      acceptanceCriteria: ['A second client observes the authoritative result.'],
    },
    performance: { considerations: ['Bound work per player request.'] },
    sourceRefs: [{ title: 'Roblox Creator documentation', type: 'official-documentation', reference: 'https://create.roblox.com/docs', retrievedAt: '2026-11-07' }],
    platformState: { state, robloxVersion: '2026.11', studioVersion: '2026.11', checkedAt: '2026-11-07' },
    maturity: {
      level: maturity,
      evidence: [{ kind: 'design', reference: 'docs/game-intelligence/research-log.md', description: 'Design review for the record.', observedAt: '2026-11-07' }],
    },
    assumptions: ['This record describes a reusable pattern, not a certified experience.'],
    owner: 'Game Intelligence',
    reviewedAt: '2026-11-07',
  };
}

async function makeRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-knowledge-'));
  await fs.mkdir(path.join(root, ...RECORDS), { recursive: true });
  return root;
}

async function writeRecord(root, relativePath, record) {
  const filePath = path.join(root, ...RECORDS, ...relativePath.split('/'));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return filePath;
}

test('loads valid records in stable ID order and reports malformed and invalid records', async () => {
  const root = await makeRoot();
  try {
    await writeRecord(root, 'genres/genre.z-adventure.json', makeRecord({ id: 'genre.z-adventure' }));
    await writeRecord(root, 'mechanics/mechanic.a-grapple.json', makeRecord({
      id: 'mechanic.a-grapple',
      kind: 'mechanic',
      summary: 'A grapple movement action for traversal.',
      dependencies: [{ id: 'genre.z-adventure', relation: 'supports', rationale: 'Traversal can support exploration.' }],
    }));
    const recordsPath = path.join(root, ...RECORDS);
    await fs.writeFile(path.join(recordsPath, 'broken.json'), '{ invalid json', 'utf8');
    const invalid = makeRecord({ id: 'mechanic.invalid-source' });
    invalid.sourceRefs = [];
    await writeRecord(root, 'mechanics/invalid.json', invalid);

    const result = await loadKnowledge(root);
    assert.deepEqual(result.records.map((record) => record.id), ['genre.z-adventure', 'mechanic.a-grapple'], JSON.stringify(result.diagnostics));
    assert(result.diagnostics.some((entry) => entry.code === 'MALFORMED_JSON' && entry.path === 'broken.json'));
    assert(result.diagnostics.some((entry) => entry.code === 'INVALID_RECORD' && entry.path === 'mechanics/invalid.json' && entry.fieldPath === 'sourceRefs'));
    assert(result.records.every((record) => !path.isAbsolute(record.relativePath)));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('excludes every valid record that shares a duplicate ID and reports each copy', async () => {
  const root = await makeRoot();
  try {
    await writeRecord(root, 'mechanics/a.json', makeRecord({ id: 'mechanic.shared' }));
    await writeRecord(root, 'mechanics/b.json', makeRecord({ id: 'mechanic.shared', summary: 'A second copy.' }));
    await writeRecord(root, 'genres/unique.json', makeRecord({ id: 'genre.unique' }));

    const result = await loadKnowledge(root);
    assert.deepEqual(result.records.map((record) => record.id), ['genre.unique'], JSON.stringify(result.diagnostics));
    const duplicates = result.diagnostics.filter((entry) => entry.code === 'DUPLICATE_ID');
    assert.equal(duplicates.length, 2);
    assert.deepEqual(duplicates.map((entry) => entry.path), ['mechanics/a.json', 'mechanics/b.json']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('bounds file size and nesting, and never follows a symlinked record', async (t) => {
  const root = await makeRoot();
  try {
    const recordsRoot = path.join(root, ...RECORDS);
    await fs.writeFile(path.join(recordsRoot, 'too-large.json'), ' '.repeat(64 * 1024 + 1), 'utf8');
    const deepDirectory = path.join(recordsRoot, 'a', 'b', 'c', 'd', 'e');
    await fs.mkdir(deepDirectory, { recursive: true });
    await fs.writeFile(path.join(deepDirectory, 'too-deep.json'), JSON.stringify(makeRecord({ id: 'genre.too-deep' })), 'utf8');

    const outside = path.join(root, 'outside.json');
    await fs.writeFile(outside, JSON.stringify(makeRecord({ id: 'genre.outside' })), 'utf8');
    let symlinkCreated = false;
    try {
      await fs.symlink(outside, path.join(recordsRoot, 'external.json'), 'file');
      symlinkCreated = true;
    } catch (error) {
      if (!['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) throw error;
      t.diagnostic(`File symlink creation is unavailable on this host (${error.code}); other path bounds are still checked.`);
    }

    const result = await loadKnowledge(root);
    assert(result.diagnostics.some((entry) => entry.code === 'RECORD_TOO_LARGE' && entry.path === 'too-large.json'));
    assert(result.diagnostics.some((entry) => entry.code === 'MAX_DEPTH_EXCEEDED' && entry.path === 'a/b/c/d/e'), JSON.stringify(result.diagnostics));
    if (symlinkCreated) {
      assert(result.diagnostics.some((entry) => entry.code === 'SYMLINK_REJECTED' && entry.path === 'external.json'));
      assert(!result.records.some((record) => record.id === 'genre.outside'));
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('rejects a symlinked records root before reading outside content', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-knowledge-root-'));
  try {
    const recordsPath = path.join(root, ...RECORDS);
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-knowledge-outside-'));
    try {
      await fs.writeFile(path.join(outside, 'record.json'), JSON.stringify(makeRecord({ id: 'genre.outside-root' })), 'utf8');
      await fs.mkdir(path.dirname(recordsPath), { recursive: true });
      try {
        await fs.symlink(outside, recordsPath, process.platform === 'win32' ? 'junction' : 'dir');
      } catch (error) {
        if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) {
          t.skip(`Directory symlink creation is unavailable on this host (${error.code}).`);
          return;
        }
        throw error;
      }
      await assert.rejects(loadKnowledge(root), { code: 'KNOWLEDGE_PATH_INVALID' });
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('search applies stable filters, exposes source and platform status, and caps results', async () => {
  const root = await makeRoot();
  try {
    const family = makeRecord({ id: 'genre.rpg-adventure', summary: 'Exploration and quest driven adventure.' });
    const mechanicA = makeRecord({
      id: 'mechanic.movement-grapple',
      kind: 'mechanic',
      summary: 'Grapple traversal with server validated movement.',
      dependencies: [{ id: 'genre.rpg-adventure', relation: 'supports', rationale: 'Grappling supports open traversal.' }],
      state: 'beta',
      maturity: 'L2',
    });
    const mechanicB = makeRecord({
      id: 'mechanic.grapple-weapon',
      kind: 'mechanic',
      summary: 'Grapple weapon pull in an arena.',
      dependencies: [{ id: 'genre.fighting', relation: 'pairs-with', rationale: 'Pulls can shape arena combat.' }],
      state: 'released',
      maturity: 'L1',
    });
    await writeRecord(root, 'genres/rpg.json', family);
    await writeRecord(root, 'genres/fighting.json', makeRecord({ id: 'genre.fighting' }));
    await writeRecord(root, 'mechanics/z-weapon.json', mechanicB);
    await writeRecord(root, 'mechanics/a-movement.json', mechanicA);
    await fs.writeFile(path.join(root, ...RECORDS, 'invalid.json'), '{', 'utf8');

    const result = await searchKnowledge(root, {
      query: 'GRAPPLE traversal',
      kinds: ['mechanic'],
      familyIds: ['genre.rpg-adventure'],
      mechanicIds: ['mechanic.movement-grapple'],
      platformState: 'beta',
      maturity: 'L2',
      limit: 1,
    });
    assert.equal(result.total, 1, JSON.stringify(result.diagnostics));
    assert.equal(result.limit, 1);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].id, 'mechanic.movement-grapple');
    assert.equal(result.matches[0].status, 'beta');
    assert.equal(result.matches[0].sourceRefs[0].title, 'Roblox Creator documentation');
    assert.equal(result.matches[0].relativePath, 'mechanics/a-movement.json');
    assert.equal(result.diagnosticCount, 1);
    assert.equal(result.diagnostics[0].code, 'MALFORMED_JSON');

    const allGrapples = await searchKnowledge(root, { query: 'grapple', kinds: ['mechanic'], limit: 10 });
    assert.deepEqual(allGrapples.matches.map((record) => record.id), ['mechanic.grapple-weapon', 'mechanic.movement-grapple']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('keeps a valid record searchable while reporting missing dependency and conflict targets', async () => {
  const root = await makeRoot();
  try {
    const record = makeRecord({
      id: 'mechanic.unlinked-reference',
      dependencies: [{ id: 'genre.missing-family', relation: 'requires', rationale: 'Coverage gap for the linked family.' }],
    });
    record.conflicts = [{ id: 'mechanic.missing-conflict', rationale: 'Conflict target has not been catalogued.' }];
    await writeRecord(root, 'mechanics/unlinked.json', record);

    const result = await searchKnowledge(root, { kinds: ['mechanic'] });
    assert.equal(result.total, 1);
    assert.deepEqual(result.diagnostics.map((item) => item.code), ['MISSING_CONFLICT_RECORD', 'MISSING_DEPENDENCY_RECORD']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('rejects unsupported filters and invalid result limits instead of silently ignoring them', async () => {
  const root = await makeRoot();
  try {
    await assert.rejects(searchKnowledge(root, { path: '../private' }), { code: 'KNOWLEDGE_FILTER_INVALID' });
    await assert.rejects(searchKnowledge(root, { limit: 101 }), { code: 'KNOWLEDGE_FILTER_INVALID' });
    await assert.rejects(searchKnowledge(root, { kinds: ['unknown-kind'] }), { code: 'KNOWLEDGE_FILTER_INVALID' });
    await assert.rejects(searchKnowledge(root, { familyIds: ['../outside'] }), { code: 'KNOWLEDGE_FILTER_INVALID' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
