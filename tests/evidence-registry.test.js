import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadEvidenceRegistry, validateEvidenceRegistry } from '../src/services/evidence-registry.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('validates the evidence registry contract and rejects duplicate identities and unsafe references', () => {
  const record = {
    id: 'evidence.studio.local-two-client',
    type: 'studio-session',
    status: 'passed',
    title: 'Local two-client replication',
    capturedAt: '2026-11-07T20:46:21Z',
    project: 'signal-garden',
    scope: 'One local replicated state scenario.',
    reference: 'evidence/studio/local.json',
    referenceSha256: 'a'.repeat(64),
    limitations: [],
  };
  const valid = validateEvidenceRegistry({ schemaVersion: 1, updatedAt: '2026-11-08T00:00:00Z', records: [record] });
  assert.equal(valid.valid, true, JSON.stringify(valid.errors));

  const invalid = validateEvidenceRegistry({ schemaVersion: 1, updatedAt: '2026-11-08T00:00:00Z', records: [record, { ...record }, { ...record, id: 'evidence.bad-path', reference: 'evidence/../../outside.json' }] });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((item) => item.code === 'DUPLICATE_RECORD_ID'));
  assert.ok(invalid.errors.some((item) => item.path === 'records[2].reference'));
});

test('loads the two-client Studio scenario and test-only task evidence with hashes and scoped status', async () => {
  const registry = await loadEvidenceRegistry(repositoryRoot);
  assert.equal(registry.summary.total, 3);
  assert.equal(registry.summary.passed, 3);
  const studio = registry.records.find((record) => record.type === 'studio-session');
  assert.equal(studio.project, 'signal-garden');
  assert.equal(studio.referenceIntegrity.status, 'verified');
  assert.match(studio.referenceIntegrity.sha256, /^[a-f0-9]{64}$/);
  assert.equal(studio.validatedDetails.place.placeId, 0);
  assert.equal(studio.validatedDetails.studio.mode, 'Server and Clients');
  assert.ok(studio.validatedDetails.studio.sessionIds.clientPlayer1);
  assert.ok(studio.validatedDetails.studio.sessionIds.clientPlayer2);
  assert.deepEqual(studio.validatedDetails.playerIdentities, ['Player1', 'Player2']);
  assert.equal(studio.validatedDetails.steps.length, 4);
  assert.ok(studio.validatedDetails.steps.some((step) => step.action.includes('Player2')));
  assert.ok(studio.validatedDetails.steps.some((step) => step.action.includes('Player1')));
  const task = registry.records.find((record) => record.type === 'task-execution');
  assert.equal(task.status, 'passed');
  assert.ok(task.limitations.some((item) => item.includes('test-only')));
  const windows = registry.records.find((record) => record.id === 'evidence.ci.lab-service-lifecycle-windows-20261108');
  assert.equal(windows.status, 'passed');
  assert.equal(windows.referenceIntegrity.status, 'verified');
  assert.equal(windows.validatedDetails.project, 'roblox-studio-ai-lab');
  assert.equal(windows.validatedDetails.nodeTests.total, 90);
  assert.equal(windows.validatedDetails.nodeTests.passed, 90);
  assert.equal(windows.validatedDetails.serviceLifecycle.cycles.length, 2);
  assert.ok(windows.validatedDetails.limitations.some((item) => item.includes('target-workstation')));
});

test('rejects a Studio evidence index that disagrees with the source acceptance record', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-evidence-registry-'));
  try {
    await fs.mkdir(path.join(root, 'evidence', 'studio'), { recursive: true });
    const source = {
      schemaVersion: 1,
      project: 'signal-garden',
      place: { placeId: 0, gameId: 0 },
      studio: { mode: 'Server and Clients', sessionIds: { server: 's', clientPlayer1: 'p1', clientPlayer2: 'p2' } },
      steps: [{ action: 'collect', result: 'replicated' }],
      acceptance: { status: 'failed', scope: 'Different scope.' },
    };
    const sourceBytes = Buffer.from(JSON.stringify(source));
    await fs.writeFile(path.join(root, 'evidence', 'studio', 'local.json'), sourceBytes);
    const registry = {
      schemaVersion: 1,
      updatedAt: '2026-11-08T00:00:00Z',
      records: [{
        id: 'evidence.studio.test-mismatch', type: 'studio-session', status: 'passed', title: 'Mismatch',
        capturedAt: '2026-11-07T20:46:21Z', project: 'signal-garden', scope: 'Claimed pass.',
        reference: 'evidence/studio/local.json', referenceSha256: createHash('sha256').update(sourceBytes).digest('hex'), limitations: [],
      }],
    };
    await fs.writeFile(path.join(root, 'evidence', 'registry.json'), JSON.stringify(registry));
    await assert.rejects(loadEvidenceRegistry(root), { code: 'EVIDENCE_STUDIO_IDENTITY_INVALID' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('rejects a changed evidence reference instead of silently trusting its new contents', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-evidence-hash-'));
  try {
    await fs.mkdir(path.join(root, 'evidence'), { recursive: true });
    const sourceBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, project: 'test-world' }));
    await fs.writeFile(path.join(root, 'evidence', 'source.json'), sourceBytes);
    const registry = {
      schemaVersion: 1,
      updatedAt: '2026-11-08T00:00:00Z',
      records: [{
        id: 'evidence.test.source', type: 'verification-run', status: 'unverified', title: 'Source digest check',
        capturedAt: '2026-11-07T20:46:21Z', project: 'test-world', scope: 'Hash integrity only.',
        reference: 'evidence/source.json', referenceSha256: '0'.repeat(64), limitations: [],
      }],
    };
    await fs.writeFile(path.join(root, 'evidence', 'registry.json'), JSON.stringify(registry));
    await assert.rejects(loadEvidenceRegistry(root), { code: 'EVIDENCE_REFERENCE_HASH_MISMATCH' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
