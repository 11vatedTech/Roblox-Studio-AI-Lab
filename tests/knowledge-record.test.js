import test from 'node:test';
import assert from 'node:assert/strict';
import { validateKnowledgeRecord, validateTaskGraph } from '../src/core/knowledge-record.js';

const KIND_PREFIX = {
  'engine-capability': 'engine',
  'game-family': 'genre',
  mechanic: 'mechanic',
  'visual-style': 'style',
  'animation-domain': 'animation',
  'product-pattern': 'product',
  'production-pattern': 'production',
  'failure-pattern': 'failure',
};

function record(kind = 'game-family', id = `${KIND_PREFIX[kind]}.example`) {
  return {
    id,
    kind,
    version: '1.0.0',
    summary: 'A concise, bounded explanation of the capability.',
    designKnowledge: { principles: ['Keep the player-facing loop legible.'] },
    technicalPatterns: [{ name: 'Server authority', guidance: 'Validate player actions and award state on the server.' }],
    dependencies: [{ id: 'mechanic.movement', relation: 'supports', rationale: 'Movement shapes how players reach the content.' }],
    conflicts: [],
    failureModes: [{ id: 'unclear-feedback', description: 'The player cannot tell whether an action succeeded.', mitigation: 'Use visible state feedback and repeatable interaction tests.' }],
    testing: {
      scenarios: [{ id: 'basic-loop', action: 'Complete one ordinary interaction.', expected: 'The authoritative state changes once and is visible to the player.' }],
      acceptanceCriteria: ['The interaction can be repeated without duplicate rewards.'],
    },
    performance: { considerations: ['Profile on the intended device tier before certification.'] },
    sourceRefs: [{ title: 'Roblox Creator documentation', type: 'official-documentation', reference: 'https://create.roblox.com/docs', retrievedAt: '2026-11-07' }],
    platformState: { state: 'released', robloxVersion: null, studioVersion: null, checkedAt: '2026-11-07' },
    maturity: { level: 'L2', evidence: [{ kind: 'design', reference: 'docs/game-intelligence/design/example.md', description: 'Reviewed implementation design notes.', observedAt: '2026-11-07' }] },
    assumptions: ['The stated experience is a local prototype and has not been published.'],
    owner: 'game-intelligence',
    reviewedAt: '2026-11-07',
  };
}

function task(id, ownerId, reviewerId, fileOwnership = []) {
  return {
    id,
    title: 'Implement one bounded capability',
    description: 'Create the smallest verifiable implementation for the assigned capability.',
    status: 'proposed',
    ownerId,
    reviewerId,
    capabilityIds: ['mechanic.movement'],
    fileOwnership,
    artifacts: [{ id: `${id}.source`, description: 'Changed source and implementation notes.' }],
    evidence: [],
  };
}

function graph(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'task-plan.sample-experience',
    project: 'sample-experience',
    status: 'proposed',
    createdAt: '2026-11-07T20:00:00Z',
    brief: { title: 'Sample experience', summary: 'Test an unclassified hybrid concept without forcing it into a fixed template.' },
    capabilityIds: ['genre.rpg-adventure', 'mechanic.movement'],
    tasks: [
      task('task.design-loop', 'specialist.game-designer', 'specialist.qa-reviewer', [{ path: 'docs/design/loop.md', mode: 'write' }]),
      task('task.implement-loop', 'specialist.gameplay-engineer', 'specialist.qa-reviewer', [{ path: 'projects/sample/src/server/Loop.luau', mode: 'write' }]),
    ],
    edges: [{ from: 'task.implement-loop', to: 'task.design-loop', type: 'depends-on' }],
    unknowns: ['The target place has no multiplayer profile yet.'],
    assumptions: ['The implementation remains local and unpublished.'],
    reviewGates: [{ id: 'independent-review', description: 'A reviewer who did not author the task checks source and evidence.' }],
    ...overrides,
  };
}

test('accepts each supported knowledge record kind with its typed stable ID', () => {
  for (const [kind, prefix] of Object.entries(KIND_PREFIX)) {
    const result = validateKnowledgeRecord(record(kind, `${prefix}.example-record`));
    assert.deepEqual(result, { valid: true, errors: [] }, kind);
  }
});

test('rejects a record ID whose typed prefix does not match its kind', () => {
  const result = validateKnowledgeRecord(record('game-family', 'mechanic.rpg-adventure'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path === 'id' && error.code === 'KIND_PREFIX'));
});

test('requires cited source provenance and valid review dates', () => {
  const missingSource = record();
  missingSource.sourceRefs = [];
  missingSource.reviewedAt = '2026-02-30';
  const result = validateKnowledgeRecord(missingSource);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path === 'sourceRefs' && error.code === 'PROVENANCE'));
  assert.ok(result.errors.some((error) => error.path === 'reviewedAt' && error.code === 'DATE'));
});

test('requires evidence before promoting knowledge to L3 or L4', () => {
  const executionMissing = record();
  executionMissing.maturity = { level: 'L3', evidence: [{ kind: 'design', reference: 'docs/design.md', description: 'Design only.', observedAt: '2026-11-07' }] };
  const l3 = validateKnowledgeRecord(executionMissing);
  assert.ok(l3.errors.some((error) => error.code === 'MATURITY_EVIDENCE'));

  const certificationMissing = record();
  certificationMissing.maturity = { level: 'L4', evidence: [{ kind: 'execution', reference: 'evidence/run.json', description: 'A repeatable run.', observedAt: '2026-11-07' }] };
  const l4 = validateKnowledgeRecord(certificationMissing);
  assert.equal(l4.errors.filter((error) => error.code === 'MATURITY_EVIDENCE').length, 1);
  assert.match(l4.errors.find((error) => error.code === 'MATURITY_EVIDENCE').message, /certification/);
});

test('rejects unsupported platform states and unsafe provenance paths', () => {
  const invalid = record();
  invalid.platformState.state = 'coming-soon';
  invalid.sourceRefs[0].reference = '../external.md';
  const result = validateKnowledgeRecord(invalid);
  assert.ok(result.errors.some((error) => error.path === 'platformState.state' && error.code === 'ENUM'));
  assert.ok(result.errors.some((error) => error.path === 'sourceRefs[0].reference' && error.code === 'REFERENCE'));
});

test('accepts an acyclic task graph with distinct authors and reviewers', () => {
  assert.deepEqual(validateTaskGraph(graph()), { valid: true, errors: [] });
});

test('rejects duplicate task IDs, missing edge references, and unsupported edge types', () => {
  const duplicate = graph();
  duplicate.tasks[1].id = duplicate.tasks[0].id;
  duplicate.edges[0] = { from: 'task.design-loop', to: 'task.missing', type: 'teleport' };
  const result = validateTaskGraph(duplicate);
  assert.ok(result.errors.some((error) => error.code === 'DUPLICATE_ID'));
  assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_TASK'));
  assert.ok(result.errors.some((error) => error.code === 'ENUM'));
});

test('rejects dependency cycles and conflicting write ownership', () => {
  const cyclic = graph({
    edges: [
      { from: 'task.design-loop', to: 'task.implement-loop', type: 'depends-on' },
      { from: 'task.implement-loop', to: 'task.design-loop', type: 'depends-on' },
    ],
  });
  cyclic.tasks[1].fileOwnership[0].path = cyclic.tasks[0].fileOwnership[0].path;
  const result = validateTaskGraph(cyclic);
  assert.ok(result.errors.some((error) => error.code === 'DEPENDENCY_CYCLE'));
  assert.ok(result.errors.some((error) => error.code === 'OWNERSHIP_COLLISION'));
});

test('rejects self-review, unsafe paths, and passed tasks without linked output and evidence', () => {
  const invalid = graph();
  invalid.tasks[0].reviewerId = invalid.tasks[0].ownerId;
  invalid.tasks[0].fileOwnership[0].path = '..\\outside.md';
  invalid.tasks[1].status = 'passed';
  const result = validateTaskGraph(invalid);
  assert.ok(result.errors.some((error) => error.code === 'SELF_REVIEW'));
  assert.ok(result.errors.some((error) => error.code === 'PATH'));
  assert.ok(result.errors.filter((error) => error.code === 'PASS_EVIDENCE').length >= 2);
});

test('rejects unknown task statuses', () => {
  const invalid = graph();
  invalid.tasks[0].status = 'complete';
  const result = validateTaskGraph(invalid);
  assert.ok(result.errors.some((error) => error.path === 'tasks[0].status' && error.code === 'ENUM'));
});
