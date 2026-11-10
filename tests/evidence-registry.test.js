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

test('loads scoped Studio, task, and source-bound verification evidence with hashes', async () => {
  const registry = await loadEvidenceRegistry(repositoryRoot);
  assert.ok(registry.summary.total >= 6);
  assert.ok(registry.summary.passed >= 6);
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

  const verification = registry.records.find((record) => record.id === 'evidence.lab.evidence-registry-verification-20261108');
  assert.equal(verification.status, 'passed');
  assert.equal(verification.referenceIntegrity.status, 'verified');
  assert.match(verification.validatedDetails.sourceIdentity.commit, /^[a-f0-9]{40}$/);
  assert.match(verification.validatedDetails.sourceIdentity.treeSha256, /^[a-f0-9]{64}$/);
  assert.equal(verification.validatedDetails.sourceIdentity.dirty, true);
  assert.equal(verification.validatedDetails.capabilityCoverage, undefined);
  assert.equal(verification.validatedDetails.independentReview, undefined);
  for (const id of [
    'evidence.lab.offline-validation-20261108',
    'evidence.lab.workstation-lifecycle-20261108',
    'evidence.lab.backup-restore-20261108',
    'evidence.lab.evidence-registry-verification-20261109t001810408z',
  ]) {
    const record = registry.records.find((item) => item.id === id);
    assert.equal(record.status, 'passed');
    assert.equal(record.referenceIntegrity.status, 'verified');
    assert.match(record.validatedDetails.sourceIdentity.treeSha256, /^[a-f0-9]{64}$/);
  }
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

test('rejects malformed source snapshot claims inside a correctly hashed typed record', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-evidence-source-identity-'));
  try {
    await fs.mkdir(path.join(root, 'evidence'), { recursive: true });
    const sourceBytes = Buffer.from(`${JSON.stringify({
      schemaVersion: 1,
      project: 'test-world',
      sourceIdentity: { commit: 'a'.repeat(40), treeSha256: 'not-a-digest', dirty: false },
    })}\n`);
    await fs.writeFile(path.join(root, 'evidence', 'source.json'), sourceBytes);
    const registry = {
      schemaVersion: 1,
      updatedAt: '2026-11-08T00:00:00Z',
      records: [{
        id: 'evidence.test.invalid-source-snapshot', type: 'verification-run', status: 'unverified', title: 'Malformed source snapshot',
        capturedAt: '2026-11-07T20:46:21Z', project: 'test-world', scope: 'Malformed identity is rejected.',
        reference: 'evidence/source.json', referenceSha256: createHash('sha256').update(sourceBytes).digest('hex'), limitations: [],
      }],
    };
    await fs.writeFile(path.join(root, 'evidence', 'registry.json'), JSON.stringify(registry));
    await assert.rejects(loadEvidenceRegistry(root), { code: 'EVIDENCE_SOURCE_IDENTITY_INVALID' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
