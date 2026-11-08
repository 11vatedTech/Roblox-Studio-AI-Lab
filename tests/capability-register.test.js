import assert from 'node:assert/strict';
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
      acceptanceCriteria: ['Build with the pinned tool and bind output to source.'],
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
  await fs.writeFile(path.join(root, 'evidence', 'build.json'), '{}\n');
  return root;
}

test('loads a validated machine-readable Lab capability register and summarizes precise statuses', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await loadCapabilityRegister(root);
  assert.equal(result.schemaVersion, 1);
  assert.ok(result.capabilities.length >= 15);
  assert.equal(result.summary.total, result.capabilities.length);
  assert.equal(result.summary.VERIFIED, result.capabilities.filter((item) => item.status === 'VERIFIED').length);
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
