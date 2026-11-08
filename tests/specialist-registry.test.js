import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSpecialistRegistry } from '../src/services/specialist-registry.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(repositoryRoot, 'docs', 'game-intelligence', 'specialists', 'registry.json');
const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
const registrySchema = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'docs', 'game-intelligence', 'schemas', 'specialist-registry.schema.json'), 'utf8'));
const specialistSchema = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'docs', 'game-intelligence', 'schemas', 'specialist.schema.json'), 'utf8'));
const specialistById = new Map(registry.specialists.map((specialist) => [specialist.id, specialist]));

test('machine-readable specialist schemas match the registry shape used by the Lab', () => {
  assert.deepEqual(registrySchema.required, ['schemaVersion', 'divisions', 'allowedOperationClasses', 'forbiddenOperationClasses', 'humanApprovalRequirements', 'specialists']);
  assert.equal(registrySchema.properties.specialists.items.$ref, 'specialist.schema.json');
  for (const field of specialistSchema.required) {
    assert.ok(registry.specialists.every((specialist) => Object.hasOwn(specialist, field)), `Registry records omit required field ${field}`);
  }
  for (const specialist of registry.specialists) {
    for (const field of Object.keys(specialist)) assert.ok(Object.hasOwn(specialistSchema.properties, field), `${specialist.id} has an undocumented field ${field}`);
  }
});

test('runtime registry loader validates every current role contract and its permission boundary', async () => {
  const loaded = await loadSpecialistRegistry(repositoryRoot);
  assert.equal(loaded.specialists.length, registry.specialists.length);
  for (const specialist of loaded.specialists) assert.match(specialist.contractSha256, /^[a-f0-9]{64}$/);
});

test('registry maps each specialist to an existing role contract and typed capabilities', async () => {
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.specialists.length, 20);
  assert.deepEqual(new Set(registry.specialists.map((specialist) => specialist.id)).size, registry.specialists.length);

  const capabilityPattern = /^(?:genre|mechanic|style|animation|engine|product|production|failure)\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
  for (const specialist of registry.specialists) {
    assert.match(specialist.id, /^specialist\.[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(registry.divisions.includes(specialist.division), `${specialist.id} uses an unknown division`);
    assert.match(specialist.contractPath, /^skills\/roles\/[a-z0-9-]+\.md$/);
    const contractPath = path.resolve(repositoryRoot, ...specialist.contractPath.split('/'));
    assert.ok(contractPath.startsWith(`${repositoryRoot}${path.sep}`), `${specialist.id} contract escapes the repository`);
    assert.equal((await fs.stat(contractPath)).isFile(), true, `${specialist.id} contract is missing`);
    assert.ok(specialist.capabilityIds.length > 0, `${specialist.id} has no capabilities`);
    assert.equal(new Set(specialist.capabilityIds).size, specialist.capabilityIds.length, `${specialist.id} repeats a capability`);
    for (const capabilityId of specialist.capabilityIds) assert.match(capabilityId, capabilityPattern);
    assert.ok(specialist.inputArtifactTypes.length > 0, `${specialist.id} has no declared inputs`);
    assert.ok(specialist.outputArtifactTypes.length > 0, `${specialist.id} has no declared outputs`);
  }
});

test('specialist permissions use only declared operation classes and exclude sensitive operations', () => {
  const allowed = new Set(registry.allowedOperationClasses);
  const forbidden = new Set(registry.forbiddenOperationClasses);
  assert.ok(forbidden.size > 0);

  for (const specialist of registry.specialists) {
    assert.equal(new Set(specialist.permittedOperationClasses).size, specialist.permittedOperationClasses.length, `${specialist.id} repeats an operation class`);
    for (const operation of specialist.permittedOperationClasses) {
      assert.ok(allowed.has(operation), `${specialist.id} uses undeclared operation class ${operation}`);
      assert.ok(!forbidden.has(operation), `${specialist.id} receives forbidden operation class ${operation}`);
    }
    if (specialist.division !== 'Engineering') {
      assert.ok(!specialist.permittedOperationClasses.includes('write-project-source'), `${specialist.id} exceeds the code-authoring boundary for its division`);
    }
  }
});

test('every output artifact has a different registered consumer', () => {
  for (const producer of registry.specialists) {
    for (const artifactType of producer.outputArtifactTypes) {
      const consumers = registry.specialists.filter((candidate) =>
        candidate.id !== producer.id && candidate.inputArtifactTypes.includes(artifactType));
      assert.ok(consumers.length > 0, `${producer.id} output '${artifactType}' has no downstream consumer`);
    }
  }
});

test('each required reviewer exists and is independent from its author', () => {
  for (const specialist of registry.specialists) {
    assert.ok(specialist.independentReviewerIds.length > 0, `${specialist.id} has no independent reviewer`);
    assert.equal(new Set(specialist.independentReviewerIds).size, specialist.independentReviewerIds.length, `${specialist.id} repeats a reviewer`);
    for (const reviewerId of specialist.independentReviewerIds) {
      assert.ok(specialistById.has(reviewerId), `${specialist.id} references missing reviewer ${reviewerId}`);
      assert.notEqual(reviewerId, specialist.id, `${specialist.id} cannot review its own work`);
    }
  }
});

test('Hero art, release, and external operations remain explicit human approval gates', () => {
  const approvals = new Set(registry.humanApprovalRequirements.map((requirement) => requirement.id));
  assert.ok(approvals.has('hero-artistic-acceptance'));
  assert.ok(approvals.has('external-or-live-operation'));
  assert.ok(approvals.has('release-certification'));
  const creativeDirector = specialistById.get('specialist.creative-director');
  const assetSpecialist = specialistById.get('specialist.asset-specialist');
  const qaDirector = specialistById.get('specialist.qa-director');
  assert.ok(creativeDirector.humanApprovalRequiredFor.includes('hero-artistic-acceptance'));
  assert.ok(assetSpecialist.humanApprovalRequiredFor.includes('hero-asset-acceptance'));
  assert.ok(qaDirector.humanApprovalRequiredFor.includes('release-certification'));
  for (const specialist of registry.specialists) {
    for (const approvalId of specialist.humanApprovalRequiredFor) {
      assert.ok(approvals.has(approvalId), `${specialist.id} references undocumented human approval ${approvalId}`);
    }
  }
});
