import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTaskPlan, getTaskHandoff, listTaskPlans, readTaskPlan, updateTask } from '../src/services/task-plan-store.js';
import { matchSpecialists } from '../src/services/specialist-registry.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function makeWorkspace() {
  const root = path.join(repositoryRoot, '.lab-runtime', `task-plan-test-${randomUUID()}`);
  await fs.mkdir(path.join(root, 'projects', 'test-world'), { recursive: true });
  const sourceRegistry = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'docs', 'game-intelligence', 'specialists', 'registry.json'), 'utf8'));
  const ownerId = 'specialist.game-design-director';
  const reviewerId = 'specialist.qa-director';
  const creativeId = 'specialist.creative-director';
  const specialists = sourceRegistry.specialists.filter((item) => [ownerId, reviewerId, creativeId].includes(item.id));
  specialists.find((item) => item.id === ownerId).independentReviewerIds = [reviewerId];
  specialists.find((item) => item.id === reviewerId).independentReviewerIds = [ownerId];
  specialists.find((item) => item.id === creativeId).independentReviewerIds = [ownerId, reviewerId];
  sourceRegistry.specialists = specialists;
  const registryPath = path.join(root, 'docs', 'game-intelligence', 'specialists', 'registry.json');
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, `${JSON.stringify(sourceRegistry, null, 2)}\n`);

  for (const specialist of specialists) {
    const sourcePath = path.join(repositoryRoot, ...specialist.contractPath.split('/'));
    const targetPath = path.join(root, ...specialist.contractPath.split('/'));
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, await fs.readFile(sourcePath, 'utf8'));
  }
  const sourceRecord = path.join(repositoryRoot, 'docs', 'game-intelligence', 'records', 'mechanics', 'mechanic.tactical-card-combat.json');
  const targetRecord = path.join(root, 'docs', 'game-intelligence', 'records', 'mechanics', 'mechanic.tactical-card-combat.json');
  await fs.mkdir(path.dirname(targetRecord), { recursive: true });
  await fs.writeFile(targetRecord, await fs.readFile(sourceRecord, 'utf8'));
  return root;
}

async function withWorkspace(run) {
  const root = await makeWorkspace();
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

const planRequest = {
  project: 'test-world',
  brief: { title: 'Tactical combat study', summary: 'Specify a server-owned tactical card combat loop for a Roblox prototype.' },
  tasks: [{
    title: 'Specify tactical combat',
    description: 'Define turn ownership, legal actions, card effects, resolution, and recovery states.',
    capabilityIds: ['mechanic.combat'],
    knowledgeIds: ['mechanic.tactical-card-combat'],
    inputArtifactTypes: [],
    outputArtifactTypes: ['design-risk-register'],
    fileOwnership: [{ path: 'docs/combat.md', mode: 'write' }],
    dependsOn: [],
  }],
};

test('matches specialists only when they cover the requested capabilities and outputs', async () => {
  await withWorkspace(async (root) => {
    const result = await matchSpecialists(root, {
      capabilityIds: ['mechanic.combat'],
      outputArtifactTypes: ['design-risk-register'],
    });
    assert.ok(result.matches.length > 0);
    assert.ok(result.matches.every((match) => match.coverage.complete));
    assert.ok(result.matches.some((match) => match.specialist.id === 'specialist.game-design-director'));
    assert.ok(result.matches[0].reviewerIds.includes('specialist.qa-director'));

    const unmatched = await matchSpecialists(root, { capabilityIds: ['mechanic.unregistered'] });
    assert.equal(unmatched.matches.length, 0);
  });
});

test('creates a project-scoped task plan with assigned specialists, reviewed knowledge, and a usable handoff', async () => {
  await withWorkspace(async (root) => {
    const created = await createTaskPlan(root, planRequest);
    assert.equal(created.project, 'test-world');
    assert.equal(created.status, 'proposed');
    assert.equal(created.revision, 1);
    assert.equal(created.tasks.length, 1);
    assert.equal(created.tasks[0].ownerId, 'specialist.game-design-director');
    assert.equal(created.tasks[0].reviewerId, 'specialist.qa-director');
    assert.deepEqual(created.tasks[0].knowledgeSnapshot.map((item) => item.id), ['mechanic.tactical-card-combat']);
    assert.equal(created.tasks[0].artifacts[0].type, 'design-risk-register');

    const handoff = await getTaskHandoff(root, 'test-world', created.id, created.tasks[0].id);
    assert.equal(handoff.owner.id, created.tasks[0].ownerId);
    assert.match(handoff.owner.contractText, /game design/i);
    assert.equal(handoff.reviewer.id, created.tasks[0].reviewerId);
    assert.equal(handoff.knowledge[0].id, 'mechanic.tactical-card-combat');
    assert.ok(!handoff.owner.permittedOperationClasses.includes('publish'));
    assert.match(handoff.operationBoundary.note, /authorize operations outside/i);

    const loaded = await readTaskPlan(root, 'test-world', created.id);
    assert.equal(loaded.id, created.id);
    assert.equal((await listTaskPlans(root, 'test-world')).length, 1);
  });
});

test('rejects direct reviewer claims and keeps review transitions inside the execution workflow', async () => {
  await withWorkspace(async (root) => {
    const plan = await createTaskPlan(root, planRequest);
    const task = plan.tasks[0];
    await assert.rejects(updateTask(root, {
      project: plan.project,
      planId: plan.id,
      taskId: task.id,
      expectedRevision: 1,
      status: 'passed',
      reviewerId: task.reviewerId,
    }), { code: 'TASK_REVIEW_REQUIRES_EXECUTION' });

    await updateTask(root, { project: plan.project, planId: plan.id, taskId: task.id, expectedRevision: 1, status: 'approved' });
    await updateTask(root, { project: plan.project, planId: plan.id, taskId: task.id, expectedRevision: 2, status: 'in_progress' });
    const projectRoot = path.join(root, 'projects', plan.project);
    await fs.mkdir(path.join(projectRoot, 'docs'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'docs', 'combat.md'), '# Tactical combat\n');
    const artifact = task.artifacts[0];
    await assert.rejects(updateTask(root, {
      project: plan.project,
      planId: plan.id,
      taskId: task.id,
      expectedRevision: 3,
      status: 'review',
      artifactLinks: [{ id: artifact.id, reference: 'docs/combat.md' }],
    }), { code: 'TASK_EXECUTION_REQUIRED' });
    const unchanged = await readTaskPlan(root, plan.project, plan.id);
    assert.equal(unchanged.tasks[0].status, 'in_progress');
    assert.equal(unchanged.revision, 3);
  });
});

test('requires every specialist input to come from an existing project artifact or a declared prerequisite', async () => {
  await withWorkspace(async (root) => {
    const request = {
      ...planRequest,
      tasks: [{
        ...planRequest.tasks[0],
        inputArtifactTypes: ['creative-direction'],
      }],
    };
    await assert.rejects(createTaskPlan(root, request), { code: 'TASK_INPUT_UNAVAILABLE' });

    const projectRoot = path.join(root, 'projects', 'test-world');
    await fs.mkdir(path.join(projectRoot, 'docs'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'docs', 'creative-direction.md'), '# Visual direction\n');
    const withLinkedInput = {
      ...request,
      tasks: [{ ...request.tasks[0], inputArtifacts: [{ type: 'creative-direction', reference: 'docs/creative-direction.md' }] }],
    };
    const created = await createTaskPlan(root, withLinkedInput);
    assert.deepEqual(created.tasks[0].inputArtifacts, [{ type: 'creative-direction', reference: 'docs/creative-direction.md' }]);
    const handoff = await getTaskHandoff(root, created.project, created.id, created.tasks[0].id);
    assert.deepEqual(handoff.task.inputArtifactTypes, ['creative-direction']);
  });
});

test('composes specialist tasks into a dependency graph with compatible artifact flow', async () => {
  await withWorkspace(async (root) => {
    const plan = await createTaskPlan(root, {
      project: 'test-world',
      brief: { title: 'Art direction into combat design', summary: 'Pass a reviewed creative direction into the combat design task.' },
      tasks: [
        {
          title: 'Set the visual direction',
          description: 'Define visual pillars and the art direction brief for the project.',
          capabilityIds: ['production.art-direction'],
          knowledgeIds: [],
          outputArtifactTypes: ['creative-direction'],
          fileOwnership: [{ path: 'docs/art-direction.md', mode: 'write' }],
        },
        {
          title: 'Design combat risks',
          description: 'Use the approved visual direction while defining combat risk and recovery criteria.',
          capabilityIds: ['mechanic.combat'],
          knowledgeIds: ['mechanic.tactical-card-combat'],
          inputArtifactTypes: ['creative-direction'],
          outputArtifactTypes: ['design-risk-register'],
          dependsOn: [0],
          fileOwnership: [{ path: 'docs/combat-risks.md', mode: 'write' }],
        },
      ],
    });
    assert.equal(plan.tasks.length, 2);
    assert.equal(plan.tasks[0].ownerId, 'specialist.creative-director');
    assert.equal(plan.tasks[0].reviewerId, 'specialist.game-design-director');
    assert.equal(plan.tasks[1].ownerId, 'specialist.game-design-director');
    assert.deepEqual(plan.edges, [{ from: plan.tasks[1].id, to: plan.tasks[0].id, type: 'depends-on' }]);
  });
});

test('rejects stale revisions, invalid assignment contracts, and artifacts outside the selected project', async () => {
  await withWorkspace(async (root) => {
    await assert.rejects(createTaskPlan(root, {
      ...planRequest,
      tasks: [{ ...planRequest.tasks[0], capabilityIds: ['mechanic.unregistered'] }],
    }), { code: 'SPECIALIST_MATCH_NOT_FOUND' });
    await assert.rejects(createTaskPlan(root, {
      ...planRequest,
      tasks: [{ ...planRequest.tasks[0], fileOwnership: [{ path: '../outside.md', mode: 'write' }] }],
    }), { code: 'TASK_PLAN_INVALID' });

    const plan = await createTaskPlan(root, planRequest);
    const task = plan.tasks[0];
    await updateTask(root, { project: plan.project, planId: plan.id, taskId: task.id, expectedRevision: 1, status: 'approved' });
    await assert.rejects(updateTask(root, {
      project: plan.project,
      planId: plan.id,
      taskId: task.id,
      expectedRevision: 1,
      status: 'in_progress',
    }), { code: 'TASK_REVISION_CONFLICT' });
    await assert.rejects(updateTask(root, {
      project: plan.project,
      planId: plan.id,
      taskId: task.id,
      expectedRevision: 2,
      status: 'in_progress',
      artifactLinks: [{ id: task.artifacts[0].id, reference: '../../package.json' }],
    }), { code: 'TASK_PLAN_INVALID' });
  });
});
