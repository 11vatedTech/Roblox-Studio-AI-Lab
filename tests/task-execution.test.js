import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTaskPlan, readTaskPlan, updateTask, recoverStaleTaskExecutions } from '../src/services/task-plan-store.js';
import {
  cancelTaskExecution,
  claimTaskExecution,
  readTaskExecutionFile,
  reviewTaskExecution,
  submitTaskExecution,
  validateTaskExecution,
  writeTaskExecutionFile,
} from '../src/services/task-plan-store.js';
import { makeTaskRequest, makeTaskWorkspace, removeTaskWorkspace } from './helpers/task-workspace.js';

async function approvedTask(root, request = makeTaskRequest()) {
  const plan = await createTaskPlan(root, request);
  await updateTask(root, { project: plan.project, planId: plan.id, taskId: plan.tasks[0].id, expectedRevision: 1, status: 'approved' });
  return { planId: plan.id, taskId: plan.tasks[0].id, task: plan.tasks[0] };
}

function actor(sessionId, processId, parentProcessId = 100) {
  return { sessionId, processId, parentProcessId, client: { name: 'test-agent', version: '1.0' } };
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('stages specialist work and accepts it only after a distinct reviewer execution', async () => {
  const root = await makeTaskWorkspace();
  try {
    const taskRef = await approvedTask(root);
    const owner = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'owner', specialistId: taskRef.task.ownerId, actor: actor('owner-session', 201) });
    await assert.rejects(validateTaskExecution(root, { project: 'test-world', ...taskRef, token: owner.token, toolRootDir: repositoryRoot }), { code: 'TASK_EXECUTION_PERMISSION_DENIED' });
    await writeTaskExecutionFile(root, { project: 'test-world', ...taskRef, token: owner.token, path: 'docs/combat.md', artifactType: 'design-risk-register', content: '# Tactical combat\n\nServer-owned turn resolution with checked legal actions.\n' });
    assert.equal(await fs.access(path.join(root, 'projects', 'test-world', 'docs', 'combat.md')).then(() => true, () => false), false);
    await submitTaskExecution(root, { project: 'test-world', ...taskRef, token: owner.token });

    await assert.rejects(claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'reviewer', specialistId: taskRef.task.reviewerId, actor: actor('same-session', 201) }), { code: 'TASK_REVIEWER_NOT_INDEPENDENT' });
    const reviewer = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'reviewer', specialistId: taskRef.task.reviewerId, actor: actor('review-session', 302, 100) });
    const output = await readTaskExecutionFile(root, { project: 'test-world', ...taskRef, token: reviewer.token, path: 'docs/combat.md' });
    assert.match(output.content, /Server-owned turn resolution/);

    const result = await reviewTaskExecution(root, {
      project: 'test-world', ...taskRef, token: reviewer.token, decision: 'accept',
      summary: 'Checked turn ownership, legal action validation, resolution, and recovery requirements.',
    });
    assert.equal(result.tasks[0].status, 'passed');
    assert.match(await fs.readFile(path.join(root, 'projects', 'test-world', 'docs', 'combat.md'), 'utf8'), /legal actions/);
    assert.equal(result.tasks[0].execution.history.at(-1).actor.processId, 302);
    assert.match(result.tasks[0].evidence.at(-1).reference, /^evidence\/task-executions\//);
  } finally {
    await removeTaskWorkspace(root);
  }
});

test('review rejection returns work for a second owner attempt and acceptance integrates the remediation', async () => {
  const root = await makeTaskWorkspace();
  try {
    const taskRef = await approvedTask(root);
    const owner1 = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'owner', specialistId: taskRef.task.ownerId, actor: actor('owner-one', 201) });
    await writeTaskExecutionFile(root, { project: 'test-world', ...taskRef, token: owner1.token, path: 'docs/combat.md', artifactType: 'design-risk-register', content: '# Draft\n\nNo rejection recovery step.\n' });
    await submitTaskExecution(root, { project: 'test-world', ...taskRef, token: owner1.token });
    const reviewer1 = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'reviewer', specialistId: taskRef.task.reviewerId, actor: actor('review-one', 301) });
    const rejected = await reviewTaskExecution(root, { project: 'test-world', ...taskRef, token: reviewer1.token, decision: 'reject', summary: 'Add a server recovery path for illegal turn actions and disconnects.' });
    assert.equal(rejected.status, 'in_progress');
    assert.equal(await fs.access(path.join(root, 'projects', 'test-world', 'docs', 'combat.md')).then(() => true, () => false), false);

    const owner2 = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'owner', specialistId: taskRef.task.ownerId, actor: actor('owner-two', 202) });
    assert.equal(owner2.attempt, 2);
    assert.match((await readTaskExecutionFile(root, { project: 'test-world', ...taskRef, token: owner2.token, path: 'docs/combat.md' })).content, /No rejection recovery step/);
    await writeTaskExecutionFile(root, { project: 'test-world', ...taskRef, token: owner2.token, path: 'docs/combat.md', artifactType: 'design-risk-register', content: '# Tactical combat\n\nServer recovery path covers illegal actions and disconnects.\n' });
    await submitTaskExecution(root, { project: 'test-world', ...taskRef, token: owner2.token });
    const reviewer2 = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'reviewer', specialistId: taskRef.task.reviewerId, actor: actor('review-two', 302) });
    const accepted = await reviewTaskExecution(root, { project: 'test-world', ...taskRef, token: reviewer2.token, decision: 'accept', summary: 'The revised artifact now describes recovery for illegal actions and disconnects.' });
    assert.equal(accepted.tasks[0].execution.attemptCount, 2);
    assert.equal(accepted.tasks[0].execution.history.filter((item) => item.type === 'review-rejected').length, 1);
    assert.match(await fs.readFile(path.join(root, 'projects', 'test-world', 'docs', 'combat.md'), 'utf8'), /disconnects/);
  } finally {
    await removeTaskWorkspace(root);
  }
});

test('serializes project ownership across plans and recovers expired leases into an explicit blocked state', async () => {
  const root = await makeTaskWorkspace();
  try {
    const first = await approvedTask(root);
    const owner = await claimTaskExecution(root, { project: 'test-world', ...first, role: 'owner', specialistId: first.task.ownerId, actor: actor('owner-session', 201), leaseMs: 1000 });
    const second = await approvedTask(root, makeTaskRequest({ title: 'Specify another tactical combat pass' }));
    await assert.rejects(claimTaskExecution(root, { project: 'test-world', ...second, role: 'owner', specialistId: second.task.ownerId, actor: actor('owner-two', 202) }), { code: 'TASK_EXECUTION_OWNERSHIP_CONFLICT' });

    const planPath = path.join(root, 'projects', 'test-world', '.lab', 'task-plans', `${first.planId}.json`);
    const stored = JSON.parse(await fs.readFile(planPath, 'utf8'));
    stored.tasks[0].execution.active.leaseExpiresAt = new Date(Date.now() - 5000).toISOString();
    await fs.writeFile(planPath, `${JSON.stringify(stored, null, 2)}\n`);
    const recovered = await recoverStaleTaskExecutions(root, 'test-world');
    assert.equal(recovered.recovered.length, 1);
    assert.equal((await readTaskPlan(root, 'test-world', first.planId)).tasks[0].status, 'blocked');
    await assert.rejects(writeTaskExecutionFile(root, { project: 'test-world', ...first, token: owner.token, path: 'docs/combat.md', artifactType: 'design-risk-register', content: '# Revoked' }), { code: 'TASK_EXECUTION_TOKEN_INVALID' });
  } finally {
    await removeTaskWorkspace(root);
  }
});

test('runs the pinned Luau parser and Rojo build against the reviewer’s staged project snapshot', async () => {
  const root = await makeTaskWorkspace();
  try {
    const projectRoot = path.join(root, 'projects', 'test-world');
    await fs.cp(path.join(repositoryRoot, 'roblox', 'templates', 'base'), projectRoot, { recursive: true });
    await fs.mkdir(path.join(projectRoot, 'tests'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'tests', 'validation.cli.spec.luau'), 'assert(1 + 1 == 2, "fixed validation smoke check")\n');
    const codeRequest = makeTaskRequest({ path: 'src/server/SignalService.luau', title: 'Update the server signal service' });
    codeRequest.tasks[0].outputArtifactTypes = ['gameplay-module'];
    const taskRef = await approvedTask(root, codeRequest);
    const owner = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'owner', specialistId: taskRef.task.ownerId, actor: actor('owner-session', 201) });
    await writeTaskExecutionFile(root, { project: 'test-world', ...taskRef, token: owner.token, path: 'src/server/SignalService.luau', artifactType: 'gameplay-module', content: 'local =\n' });
    const invalidValidation = await validateTaskExecution(root, { project: 'test-world', ...taskRef, token: owner.token, toolRootDir: repositoryRoot });
    assert.equal(invalidValidation.status, 'failed');
    assert.equal(invalidValidation.checks.some((item) => item.id.startsWith('luau-parse:') && !item.passed), true);
    await writeTaskExecutionFile(root, { project: 'test-world', ...taskRef, token: owner.token, path: 'src/server/SignalService.luau', artifactType: 'gameplay-module', content: 'local SignalService = {}\nfunction SignalService.start() return true end\nreturn SignalService\n' });

    const validation = await validateTaskExecution(root, { project: 'test-world', ...taskRef, token: owner.token, toolRootDir: repositoryRoot });
    assert.equal(validation.status, 'passed');
    assert.equal(validation.checks.find((item) => item.id === 'luau-parse').passed, true);
    assert.equal(validation.checks.find((item) => item.id === 'luau-cli-specs').passed, true);
    assert.equal(validation.checks.find((item) => item.id === 'rojo-build').passed, true);
    await submitTaskExecution(root, { project: 'test-world', ...taskRef, token: owner.token });
    const reviewer = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'reviewer', specialistId: taskRef.task.reviewerId, actor: actor('review-session', process.pid) });
    const reviewerValidation = await validateTaskExecution(root, { project: 'test-world', ...taskRef, token: reviewer.token, toolRootDir: repositoryRoot });
    assert.equal(reviewerValidation.status, 'passed', JSON.stringify(reviewerValidation.checks));
    const accepted = await reviewTaskExecution(root, { project: 'test-world', ...taskRef, token: reviewer.token, decision: 'accept', summary: 'Reviewed the staged service and passed its Luau parse and Rojo build checks.' });
    const evidencePath = path.join(root, ...accepted.tasks[0].evidence.at(-1).reference.split('/'));
    const evidence = JSON.parse(await fs.readFile(evidencePath, 'utf8'));
    assert.equal(evidence.validation.status, 'passed');
    assert.ok(evidence.validation.checks.some((item) => item.id === 'rojo-build' && item.passed));
  } finally {
    await removeTaskWorkspace(root);
  }
});

test('rejects writes outside ownership and detects source changes before reviewer acceptance', async () => {
  const root = await makeTaskWorkspace();
  try {
    const taskRef = await approvedTask(root);
    const owner = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'owner', specialistId: taskRef.task.ownerId, actor: actor('owner-session', 201) });
    await assert.rejects(writeTaskExecutionFile(root, { project: 'test-world', ...taskRef, token: owner.token, path: '../outside.md', artifactType: 'design-risk-register', content: 'escape' }), { code: 'TASK_EXECUTION_PATH_DENIED' });
    await writeTaskExecutionFile(root, { project: 'test-world', ...taskRef, token: owner.token, path: 'docs/combat.md', artifactType: 'design-risk-register', content: '# Staged\n' });
    await submitTaskExecution(root, { project: 'test-world', ...taskRef, token: owner.token });
    const reviewer = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'reviewer', specialistId: taskRef.task.reviewerId, actor: actor('review-session', 302) });
    await fs.mkdir(path.join(root, 'projects', 'test-world', 'docs'), { recursive: true });
    await fs.writeFile(path.join(root, 'projects', 'test-world', 'docs', 'combat.md'), '# Changed outside the Lab\n');
    await assert.rejects(reviewTaskExecution(root, { project: 'test-world', ...taskRef, token: reviewer.token, decision: 'accept', summary: 'Review complete.' }), { code: 'TASK_EXECUTION_CONFLICT' });
    const persisted = await readTaskPlan(root, 'test-world', taskRef.planId);
    assert.equal(persisted.tasks[0].status, 'review');
  } finally {
    await removeTaskWorkspace(root);
  }
});

test('cancellation revokes the claim and requires an explicit recovery transition before retry', async () => {
  const root = await makeTaskWorkspace();
  try {
    const taskRef = await approvedTask(root);
    const owner = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'owner', specialistId: taskRef.task.ownerId, actor: actor('owner-session', 201) });
    await cancelTaskExecution(root, { project: 'test-world', ...taskRef, token: owner.token, reason: 'Required source reference is unavailable; retry after it is added.' });
    await assert.rejects(writeTaskExecutionFile(root, { project: 'test-world', ...taskRef, token: owner.token, path: 'docs/combat.md', artifactType: 'design-risk-register', content: '# Stale token' }), { code: 'TASK_EXECUTION_TOKEN_INVALID' });
    const blocked = await readTaskPlan(root, 'test-world', taskRef.planId);
    assert.equal(blocked.tasks[0].status, 'blocked');
    await assert.rejects(claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'owner', specialistId: taskRef.task.ownerId, actor: actor('owner-retry', 402) }), { code: 'TASK_EXECUTION_STATE_INVALID' });
    await updateTask(root, { project: 'test-world', planId: taskRef.planId, taskId: taskRef.taskId, expectedRevision: blocked.revision, status: 'in_progress' });
    const retry = await claimTaskExecution(root, { project: 'test-world', ...taskRef, role: 'owner', specialistId: taskRef.task.ownerId, actor: actor('owner-retry', 402) });
    assert.equal(retry.attempt, 2);
  } finally {
    await removeTaskWorkspace(root);
  }
});
