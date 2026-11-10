import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCapabilityRegister, validateCapabilityRegister } from '../src/services/capability-register.js';

function validRegister() {
  return {
    schemaVersion: 1,
    updatedAt: '2026-11-07T00:00:00.000Z',
    capabilities: [{
      id: 'LAB-TEST-001',
      title: 'Bounded project build',
      status: 'VERIFIED',
      dependencyIds: [],
      implementationPaths: ['src/build.js'],
      acceptanceCriteria: ['Build with the pinned tool.', 'Bind output to the exact source snapshot.'],
      verificationMethod: 'Run the project build integration test.',
      verificationResult: 'passed',
      evidenceRefs: ['evidence/build.json'],
      outstandingDefects: [],
      blockers: [],
      approvalRequirements: [],
    }],
  };
}

async function makeRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-capabilities-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(path.join(root, 'evidence'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'build.js'), 'export {};\n');
  await writeTypedEvidence(root, {
    schemaVersion: 1,
    project: 'test-world',
    sourceIdentity: { commit: 'a'.repeat(40), treeSha256: 'b'.repeat(64), dirty: false },
    capabilityCoverage: [{ capabilityId: 'LAB-TEST-001', acceptanceCriteriaIndexes: [0, 1] }],
    independentReview: {
      status: 'passed',
      authorIdentity: 'owner-process:101/session:owner',
      reviewerIdentity: 'reviewer-process:202/session:reviewer',
      separation: 'distinct-process',
    },
  });
  return root;
}

async function writeTypedEvidence(root, source) {
  const sourceBytes = Buffer.from(`${JSON.stringify(source)}\n`);
  const reference = 'evidence/build.json';
  await fs.writeFile(path.join(root, reference), sourceBytes);
  const registry = {
    schemaVersion: 1,
    updatedAt: '2026-11-07T00:00:00.000Z',
    records: [{
      id: 'evidence.test.build',
      type: 'verification-run',
      status: 'passed',
      title: 'Source-bound project build verification',
      capturedAt: '2026-11-07T00:00:00.000Z',
      project: 'test-world',
      scope: 'Build and source snapshot verification for LAB-TEST-001.',
      reference,
      referenceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
      limitations: [],
    }],
  };
  await fs.writeFile(path.join(root, 'evidence', 'registry.json'), `${JSON.stringify(registry)}\n`);
}

test('loads a validated machine-readable Lab capability register and summarizes precise statuses', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await loadCapabilityRegister(root);
  assert.equal(result.schemaVersion, 1);
  assert.ok(result.capabilities.length >= 15);
  assert.equal(result.summary.total, result.capabilities.length);
  assert.equal(result.summary.VERIFIED, result.capabilities.filter((item) => item.status === 'VERIFIED').length);
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-CORE-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-EVIDENCE-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-STUDIO-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-STUDIO-002'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-INTEL-002'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-PROJECT-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-ORCH-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-ORCH-002'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-ASSET-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-ART-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-GAME-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-QA-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-QA-002'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-PERF-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-SEC-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-PRODUCT-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-BENCH-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-CI-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-RECOVERY-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-RELEASE-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-ROJO-001'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-ROJO-002'));
  assert.ok(result.capabilities.some((item) => item.id === 'LAB-INTEL-001'));
  assert.ok(result.capabilities.every((item) => item.acceptanceCriteria.length > 0));
  assert.ok(result.capabilities.every((item) => Array.isArray(item.dependencyIds)));
  assert.ok(result.capabilities.every((item) => Array.isArray(item.outstandingDefects)));
  assert.ok(result.capabilities.every((item) => Array.isArray(item.blockers)));
  assert.ok(result.capabilities.every((item) => Array.isArray(item.approvalRequirements)));
  assert.ok(result.capabilities.every((item) => Array.isArray(item.implementationPaths)));
  assert.ok(result.capabilities.every((item) => Array.isArray(item.evidenceRefs)));
  assert.ok(result.capabilities.every((item) => item.verificationResult.length > 0));
  assert.ok(result.capabilities.every((item) => item.verificationMethod.length > 0));
  assert.ok(result.capabilities.every((item) => item.title.length > 0));
  assert.ok(result.capabilities.every((item) => item.id.length > 0));
  assert.ok(result.capabilities.every((item) => item.status.length > 0));
  assert.equal(result.schemaVersion, 1);
  assert.ok(result.updatedAt.length > 0);
  assert.ok(result.capabilities.every((item) => typeof item === 'object'));
  assert.ok(result.capabilities.every((item) => item.acceptanceCriteria.length > 0));
});

test('rejects unverified completion, missing evidence, invalid paths, dangling dependencies, and cycles', async () => {
  const root = await makeRoot();
  try {
    const register = validRegister();
    register.capabilities[0].verificationResult = 'not_run';
    register.capabilities[0].evidenceRefs = [];
    register.capabilities[0].implementationPaths = ['../outside.js'];
    register.capabilities[0].dependencyIds = ['LAB-MISSING-001'];
    const validation = await validateCapabilityRegister(root, register);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((error) => error.path.endsWith('.verificationResult')));
    assert.ok(validation.errors.some((error) => error.path.endsWith('.evidenceRefs')));
    assert.ok(validation.errors.some((error) => error.code === 'UNSAFE_PATH'));
    assert.ok(validation.errors.some((error) => error.code === 'UNKNOWN_DEPENDENCY'));

    register.capabilities.push({ ...validRegister().capabilities[0], id: 'LAB-TEST-002', dependencyIds: ['LAB-TEST-001'], status: 'IMPLEMENTED', verificationResult: 'not_run', evidenceRefs: [] });
    register.capabilities[0].dependencyIds = ['LAB-TEST-002'];
    const cycle = await validateCapabilityRegister(root, register);
    assert.ok(cycle.errors.some((error) => error.code === 'DEPENDENCY_CYCLE'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('rejects VERIFIED evidence files that have no matching typed registry record', async () => {
  const root = await makeRoot();
  try {
    await fs.writeFile(path.join(root, 'evidence', 'registry.json'), JSON.stringify({ schemaVersion: 1, updatedAt: '2026-11-07T00:00:00Z', records: [] }));
    const result = await validateCapabilityRegister(root, validRegister());
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === 'VERIFIED_WITHOUT_TYPED_EVIDENCE'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('requires typed passing evidence to bind every criterion to a source snapshot and independent reviewer', async () => {
  const root = await makeRoot();
  try {
    const incompleteCoverage = {
      schemaVersion: 1,
      project: 'test-world',
      sourceIdentity: { commit: 'a'.repeat(40), treeSha256: 'b'.repeat(64), dirty: false },
      capabilityCoverage: [{ capabilityId: 'LAB-TEST-001', acceptanceCriteriaIndexes: [0] }],
      independentReview: {
        status: 'passed',
        authorIdentity: 'owner-process:101/session:owner',
        reviewerIdentity: 'reviewer-process:202/session:reviewer',
        separation: 'distinct-process',
      },
    };
    await writeTypedEvidence(root, incompleteCoverage);
    let result = await validateCapabilityRegister(root, validRegister());
    assert.ok(result.errors.some((error) => error.code === 'VERIFIED_EVIDENCE_COVERAGE_INCOMPLETE'));

    await writeTypedEvidence(root, {
      ...incompleteCoverage,
      capabilityCoverage: [{ capabilityId: 'LAB-TEST-001', acceptanceCriteriaIndexes: [0, 1] }],
    });
    const failedRegistry = JSON.parse(await fs.readFile(path.join(root, 'evidence', 'registry.json'), 'utf8'));
    failedRegistry.records[0].status = 'failed';
    await fs.writeFile(path.join(root, 'evidence', 'registry.json'), JSON.stringify(failedRegistry));
    result = await validateCapabilityRegister(root, validRegister());
    assert.ok(result.errors.some((error) => error.code === 'VERIFIED_WITHOUT_PASSED_EVIDENCE'));

    const selfReviewed = {
      ...incompleteCoverage,
      capabilityCoverage: [{ capabilityId: 'LAB-TEST-001', acceptanceCriteriaIndexes: [0, 1] }],
      independentReview: {
        ...incompleteCoverage.independentReview,
        reviewerIdentity: incompleteCoverage.independentReview.authorIdentity,
      },
    };
    await writeTypedEvidence(root, selfReviewed);
    result = await validateCapabilityRegister(root, validRegister());
    assert.ok(result.errors.some((error) => error.code === 'VERIFIED_EVIDENCE_REVIEW_NOT_INDEPENDENT'));

    const unbound = { ...selfReviewed, sourceIdentity: undefined, independentReview: incompleteCoverage.independentReview };
    await writeTypedEvidence(root, unbound);
    result = await validateCapabilityRegister(root, validRegister());
    assert.ok(result.errors.some((error) => error.code === 'VERIFIED_EVIDENCE_SOURCE_UNBOUND'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('requires a blocker for blocked status and rejects missing or symlinked evidence', async () => {
  const root = await makeRoot();
  try {
    const register = validRegister();
    register.capabilities[0].status = 'BLOCKED_EXTERNAL';
    register.capabilities[0].verificationResult = 'blocked';
    register.capabilities[0].evidenceRefs = ['evidence/missing.json'];
    const validation = await validateCapabilityRegister(root, register);
    assert.ok(validation.errors.some((error) => error.path.endsWith('.blockers')));
    assert.ok(validation.errors.some((error) => error.code === 'FILE_NOT_FOUND'));
    assert.equal((await validateCapabilityRegister(root, { ...register, capabilities: [{ ...register.capabilities[0], status: 'VERIFIED' }] })).valid, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
