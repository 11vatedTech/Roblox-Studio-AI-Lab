import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createLabServer } from '../src/server/app.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function makeWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `task-plan-api-test-${randomUUID()}-`));
  await fs.mkdir(path.join(root, 'projects', 'test-world'), { recursive: true });
  const registry = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'docs', 'game-intelligence', 'specialists', 'registry.json'), 'utf8'));
  const ownerId = 'specialist.game-design-director';
  const reviewerId = 'specialist.qa-director';
  const specialists = registry.specialists.filter((item) => [ownerId, reviewerId].includes(item.id));
  specialists.find((item) => item.id === ownerId).independentReviewerIds = [reviewerId];
  specialists.find((item) => item.id === reviewerId).independentReviewerIds = [ownerId];
  registry.specialists = specialists;
  const registryPath = path.join(root, 'docs', 'game-intelligence', 'specialists', 'registry.json');
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  for (const specialist of specialists) {
    const target = path.join(root, ...specialist.contractPath.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await fs.readFile(path.join(repositoryRoot, ...specialist.contractPath.split('/')), 'utf8'));
  }
  const record = path.join(root, 'docs', 'game-intelligence', 'records', 'mechanics', 'mechanic.tactical-card-combat.json');
  await fs.mkdir(path.dirname(record), { recursive: true });
  await fs.writeFile(record, await fs.readFile(path.join(repositoryRoot, 'docs', 'game-intelligence', 'records', 'mechanics', 'mechanic.tactical-card-combat.json'), 'utf8'));
  return root;
}

test('API matches registered specialists and creates retrievable project handoffs', async () => {
  const rootDir = await makeWorkspace();
  const server = createLabServer({ rootDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const matchesUrl = new URL('/api/specialists', baseUrl);
    matchesUrl.searchParams.append('capability_id', 'mechanic.combat');
    matchesUrl.searchParams.append('output_type', 'design-risk-register');
    const matchesResponse = await fetch(matchesUrl);
    assert.equal(matchesResponse.status, 200);
    const matches = await matchesResponse.json();
    assert.ok(matches.matches.some((item) => item.specialist.id === 'specialist.game-design-director'));

    const duplicateLimit = new URL('/api/specialists', baseUrl);
    duplicateLimit.searchParams.append('limit', '10');
    duplicateLimit.searchParams.append('limit', '20');
    assert.equal((await fetch(duplicateLimit)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/specialists?unexpected=1`)).status, 400);
    const extraPlanFilter = new URL('/api/task-plans', baseUrl);
    extraPlanFilter.searchParams.set('project', 'test-world');
    extraPlanFilter.searchParams.set('path', '../outside');
    assert.equal((await fetch(extraPlanFilter)).status, 400);
    const duplicateProject = `${baseUrl}/api/task-plans?project=test-world&project=test-world`;
    assert.equal((await fetch(duplicateProject)).status, 400);

    const response = await fetch(`${baseUrl}/api/task-plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({
        project: 'test-world',
        brief: { title: 'Tactical combat study', summary: 'Specify a server-owned tactical card combat loop.' },
        tasks: [{
          title: 'Specify tactical combat',
          description: 'Define legal actions, state transitions, resolution, and recovery.',
          capabilityIds: ['mechanic.combat'],
          knowledgeIds: ['mechanic.tactical-card-combat'],
          outputArtifactTypes: ['design-risk-register'],
          fileOwnership: [{ path: 'docs/combat.md', mode: 'write' }],
        }],
      }),
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.plan.tasks[0].ownerId, 'specialist.game-design-director');
    assert.equal(created.plan.tasks[0].reviewerId, 'specialist.qa-director');

    const plansUrl = new URL('/api/task-plans', baseUrl);
    plansUrl.searchParams.set('project', 'test-world');
    const plans = await (await fetch(plansUrl)).json();
    assert.equal(plans.plans.length, 1);
    assert.equal(plans.plans[0].id, created.plan.id);

    const projects = await (await fetch(`${baseUrl}/api/projects`)).json();
    assert.equal(projects.projects.find((item) => item.name === 'test-world').taskPlanCount, 1);
    assert.equal(projects.projects.find((item) => item.name === 'test-world').openTaskCount, 1);

    const transitionUrl = `${baseUrl}/api/task-plans/${created.plan.id}/tasks/${created.plan.tasks[0].id}?project=test-world`;
    const blocked = await fetch(transitionUrl, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: 'http://example.invalid' },
      body: JSON.stringify({ expectedRevision: 1, status: 'approved' }),
    });
    assert.equal(blocked.status, 403);
    const approved = await fetch(transitionUrl, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ expectedRevision: 1, status: 'approved' }),
    });
    const approvedBody = await approved.json();
    assert.equal(approved.status, 200, JSON.stringify(approvedBody));
    assert.equal(approvedBody.plan.tasks[0].status, 'approved');

    const handoffUrl = new URL(`/api/task-plans/${created.plan.id}/tasks/${created.plan.tasks[0].id}/handoff`, baseUrl);
    handoffUrl.searchParams.set('project', 'test-world');
    const handoffResponse = await fetch(handoffUrl);
    const handoff = await handoffResponse.json();
    assert.equal(handoffResponse.status, 200, JSON.stringify(handoff));
    assert.equal(handoff.handoff.owner.id, 'specialist.game-design-director');
    assert.match(handoff.handoff.owner.contractText, /game design/i);
    assert.equal(handoff.handoff.knowledge[0].id, 'mechanic.tactical-card-combat');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});
