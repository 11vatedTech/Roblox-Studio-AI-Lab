import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTaskPlan, readTaskPlan, updateTask } from '../src/services/task-plan-store.js';
import { makeTaskRequest, makeTaskWorkspace, removeTaskWorkspace } from './helpers/task-workspace.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(repositoryRoot, 'src', 'mcp', 'lab-task-server.js');
// Task validation launches pinned Luau and Rojo processes while the test suite
// runs other process-heavy integration tests in parallel. Keep the RPC bound,
// with enough headroom for that supported workload.
const MCP_REQUEST_TIMEOUT_MS = 15_000;

function startMcpClient(root, name) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: repositoryRoot,
    env: { ...process.env, LAB_WORKSPACE_ROOT: root, LAB_TOOL_ROOT: repositoryRoot },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  let nextId = 0;
  const pending = new Map();
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter.resolve(message);
      }
    }
  });

  function request(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}. ${stderr}`));
      }, MCP_REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve: (message) => { clearTimeout(timeout); resolve(message); } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  async function initialize() {
    const response = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name, version: 'test-1' } });
    assert.equal(response.result.protocolVersion, '2025-11-25');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  }

  async function call(name, args) {
    const response = await request('tools/call', { name, arguments: args });
    assert.ok(response.result, response.error?.message ?? 'Expected MCP tool result.');
    const text = response.result.content?.[0]?.text ?? '{}';
    const value = JSON.parse(text);
    return response.result.isError ? { error: value } : { value };
  }

  async function close() {
    if (child.exitCode !== null) return;
    child.stdin.end();
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(() => { child.kill(); resolve(); }, 1500)),
    ]);
  }

  return { child, request, initialize, call, close };
}

test('the local MCP workflow executes assigned work, enforces a separate reviewer process, and persists acceptance', async () => {
  const root = await makeTaskWorkspace();
  const owner = startMcpClient(root, 'lab-owner-test');
  const reviewer = startMcpClient(root, 'lab-reviewer-test');
  let restarted;
  try {
    const projectRoot = path.join(root, 'projects', 'test-world');
    await fs.cp(path.join(repositoryRoot, 'roblox', 'templates', 'base'), projectRoot, { recursive: true });
    await fs.mkdir(path.join(projectRoot, 'tests'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'tests', 'task-validation.cli.spec.luau'), 'assert(2 * 3 == 6, "task validation check")\n');
    const taskRequest = makeTaskRequest({ path: 'src/server/SignalService.luau', title: 'Implement a server signal module' });
    taskRequest.tasks[0].outputArtifactTypes = ['gameplay-module'];
    const plan = await createTaskPlan(root, taskRequest);
    const task = plan.tasks[0];
    await updateTask(root, { project: plan.project, planId: plan.id, taskId: task.id, expectedRevision: 1, status: 'approved' });
    await Promise.all([owner.initialize(), reviewer.initialize()]);
    const listed = await owner.request('tools/list');
    assert.equal(listed.result.tools.some((tool) => tool.name === 'lab_task_write'), true);
    assert.equal(listed.result.tools.some((tool) => /process|shell|execute/i.test(tool.name)), false);

    const wrongAssignment = await owner.call('lab_task_claim', { project: 'test-world', planId: plan.id, taskId: task.id, role: 'owner', specialistId: 'specialist.qa-director' });
    assert.equal(wrongAssignment.error.code, 'TASK_EXECUTION_ASSIGNMENT_DENIED');
    const ownerClaim = await owner.call('lab_task_claim', { project: 'test-world', planId: plan.id, taskId: task.id, role: 'owner', specialistId: task.ownerId });
    assert.equal(ownerClaim.value.processId, owner.child.pid);
    assert.equal(ownerClaim.value.task.owner.id, task.ownerId);
    const competingClaim = await reviewer.call('lab_task_claim', { project: 'test-world', planId: plan.id, taskId: task.id, role: 'owner', specialistId: task.ownerId });
    assert.equal(competingClaim.error.code, 'TASK_EXECUTION_ALREADY_CLAIMED');

    const invalidPath = await owner.call('lab_task_write', { project: 'test-world', planId: plan.id, taskId: task.id, path: '../escape.md', artifactType: 'gameplay-module', content: 'escape attempt' });
    assert.equal(invalidPath.error.code, 'TASK_EXECUTION_PATH_DENIED');
    const write = await owner.call('lab_task_write', { project: 'test-world', planId: plan.id, taskId: task.id, path: 'src/server/SignalService.luau', artifactType: 'gameplay-module', content: 'local SignalService = {}\nfunction SignalService.start() return true end\nreturn SignalService\n' });
    assert.equal(write.value.path, 'src/server/SignalService.luau');
    const ownerValidation = await owner.call('lab_task_validate', { project: 'test-world', planId: plan.id, taskId: task.id });
    assert.equal(ownerValidation.value.status, 'passed');
    assert.equal(ownerValidation.value.checks.find((item) => item.id === 'luau-parse').passed, true);
    assert.equal(ownerValidation.value.checks.find((item) => item.id === 'luau-cli-specs').passed, true);
    assert.equal(ownerValidation.value.checks.find((item) => item.id === 'rojo-build').passed, true);
    await owner.call('lab_task_submit', { project: 'test-world', planId: plan.id, taskId: task.id });

    const sameProcessReview = await owner.call('lab_task_claim', { project: 'test-world', planId: plan.id, taskId: task.id, role: 'reviewer', specialistId: task.reviewerId });
    assert.equal(sameProcessReview.error.code, 'TASK_REVIEWER_NOT_INDEPENDENT');
    const reviewerClaim = await reviewer.call('lab_task_claim', { project: 'test-world', planId: plan.id, taskId: task.id, role: 'reviewer', specialistId: task.reviewerId });
    assert.equal(reviewerClaim.value.processId, reviewer.child.pid);
    const reviewedFile = await reviewer.call('lab_task_read', { project: 'test-world', planId: plan.id, taskId: task.id, path: 'src/server/SignalService.luau' });
    assert.equal(reviewedFile.value.staged, true);
    assert.match(reviewedFile.value.content, /SignalService.start/);
    const fixedChecks = await reviewer.call('lab_task_validate', { project: 'test-world', planId: plan.id, taskId: task.id });
    assert.equal(fixedChecks.value.status, 'passed');
    assert.equal(fixedChecks.value.checks.find((item) => item.id === 'rojo-build').passed, true);
    const accepted = await reviewer.call('lab_task_review', { project: 'test-world', planId: plan.id, taskId: task.id, decision: 'accept', summary: 'Reviewed the staged server module after pinned Luau, CLI spec, and Rojo checks passed.' });
    assert.equal(accepted.value.tasks[0].status, 'passed');

    const evidencePath = path.join(root, ...accepted.value.tasks[0].evidence.at(-1).reference.split('/'));
    const evidence = JSON.parse(await fs.readFile(evidencePath, 'utf8'));
    assert.equal(evidence.author.processId, owner.child.pid);
    assert.equal(evidence.reviewer.processId, reviewer.child.pid);
    assert.equal(evidence.processSeparation.differentMcpProcess, true);
    assert.match(evidence.processSeparation.limitation, /does not attest/);
    assert.equal(evidence.validation.status, 'passed');
    assert.ok(evidence.validation.checks.some((item) => item.id === 'luau-cli-specs' && item.passed));
    assert.ok(evidence.validation.checks.some((item) => item.id === 'rojo-build' && item.passed));
    if (process.env.LAB_TASK_EXECUTION_EVIDENCE_PATH) {
      const evidenceRelativePath = process.env.LAB_TASK_EXECUTION_EVIDENCE_PATH;
      assert.match(evidenceRelativePath, /^evidence\/p0\/lab-task-execution-[0-9TZ]+\.json$/);
      const evidenceTarget = path.resolve(repositoryRoot, ...evidenceRelativePath.split('/'));
      assert.ok(evidenceTarget.startsWith(`${path.join(repositoryRoot, 'evidence', 'p0')}${path.sep}`));
      for (const directory of ['evidence', 'p0']) {
        const directoryPath = path.join(repositoryRoot, ...evidenceRelativePath.split('/').slice(0, evidenceRelativePath.split('/').indexOf(directory) + 1));
        const directoryStat = await fs.lstat(directoryPath);
        assert.equal(directoryStat.isSymbolicLink(), false);
        assert.equal(directoryStat.isDirectory(), true);
      }
      const report = {
        schemaVersion: 1,
        kind: 'lab-specialist-execution-integration-test',
        generatedAt: new Date().toISOString(),
        testOnly: true,
        testFile: 'tests/lab-task-mcp.test.js',
        task: { planId: plan.id, taskId: task.id, project: plan.project, status: accepted.value.tasks[0].status, ownerId: task.ownerId, reviewerId: task.reviewerId },
        execution: {
          owner: evidence.author,
          reviewer: evidence.reviewer,
          processSeparation: evidence.processSeparation,
          outcome: evidence.outcome,
          summary: evidence.summary,
          outputs: evidence.outputs,
          fixedChecks: evidence.fixedChecks,
          validation: evidence.validation,
          reviewEvidenceReference: accepted.value.tasks[0].evidence.at(-1).reference,
        },
        fixture: { workspaceRemovedAfterTest: true, modelProviderInvoked: false, liveStudioUsed: false },
        limits: 'This integration test proves two separate MCP server processes completed the local task protocol. It does not test a real AI client, authenticate a provider or person, or certify Roblox runtime behavior.',
      };
      const handle = await fs.open(evidenceTarget, 'wx', 0o600);
      try { await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`, 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
    }

    await owner.close();
    await reviewer.close();
    restarted = startMcpClient(root, 'lab-restarted-test');
    await restarted.initialize();
    const queue = await restarted.call('lab_task_queue', { project: 'test-world' });
    assert.equal(queue.value.plans[0].tasks[0].status, 'passed');
  } finally {
    await owner.close();
    await reviewer.close();
    await restarted?.close();
    await removeTaskWorkspace(root);
  }
});
