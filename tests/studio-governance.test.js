import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StudioGovernance } from '../src/services/studio-governance.js';
import { createLabServer } from '../src/server/app.js';

async function withGovernance(run, options = {}) {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), '11vated-studio-governance-'));
  try {
    const governance = new StudioGovernance({ stateDir, ...options });
    await run(governance, stateDir);
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true });
  }
}

function scope(overrides = {}) {
  return {
    project: 'signal-garden',
    sourceRevision: '0a2e97d',
    studioId: 'd5f07df7-b8ce-4c9b-9e56-6891c6172a64',
    placeName: 'signal-garden-20261110T124445Z.rbxlx',
    placeId: '0',
    parameters: { datamodel_type: 'Edit', path: 'Workspace' },
    ...overrides,
  };
}

const executor = async () => ({ ok: true });

test('the closed matrix assigns five distinct risk classes and keeps mutations out of the dashboard', async () => {
  await withGovernance(async (governance) => {
    const matrix = governance.getMatrix();
    assert.deepEqual(matrix.riskClasses.map((entry) => entry.id), [
      'inspection', 'reversible_mutation', 'destructive_mutation', 'upload', 'publishing',
    ]);
    assert.equal(new Set(matrix.operations.map((entry) => entry.id)).size, matrix.operations.length);
    for (const risk of matrix.riskClasses) {
      assert.ok(matrix.operations.some((entry) => entry.riskClass === risk.id), `missing operation for ${risk.id}`);
    }
    for (const operation of matrix.operations.filter((entry) => entry.riskClass === 'inspection')) {
      assert.equal(operation.approvalRequired, false);
      assert.equal(operation.labExposed, true);
    }
    for (const operation of matrix.operations.filter((entry) => entry.riskClass !== 'inspection')) {
      assert.equal(operation.approvalRequired, true);
      assert.equal(operation.labExposed, false);
    }
    assert.equal(matrix.operations.find((entry) => entry.id === 'studio.save_place').riskClass, 'destructive_mutation');
    assert.equal(matrix.operations.find((entry) => entry.id === 'studio.create_sandbox_script').riskClass, 'reversible_mutation');
    assert.equal(matrix.operations.find((entry) => entry.id === 'studio.delete_sandbox_script').riskClass, 'destructive_mutation');
    assert.equal(matrix.operations.find((entry) => entry.id === 'studio.upload_asset').riskClass, 'upload');
    assert.equal(matrix.operations.find((entry) => entry.id === 'studio.publish_place').riskClass, 'publishing');
  });
});

test('inspection executes without an approval token and is audited', async () => {
  await withGovernance(async (governance) => {
    const result = await governance.execute({
      operationId: 'studio.read_state',
      scope: scope({ parameters: {} }),
      executor: async () => ({ mode: 'Edit' }),
    });
    assert.equal(result.result.mode, 'Edit');
    assert.equal(result.approval, null);
    const audit = await governance.listAudit(5);
    assert.equal(audit[0].decision, 'succeeded');
    assert.equal(audit[0].riskClass, 'inspection');
    assert.equal(audit[0].approvalId, null);
  });
});

test('an operation outside the catalog is refused even when an executor is supplied', async () => {
  await withGovernance(async (governance) => {
    await assert.rejects(
      governance.execute({ operationId: 'execute_luau', scope: scope(), executor }),
      { code: 'STUDIO_OPERATION_UNKNOWN', status: 400 },
    );
  });
});

test('a mutation without a token is denied and the denial is audited', async () => {
  await withGovernance(async (governance) => {
    await assert.rejects(
      governance.execute({ operationId: 'studio.stop_playtest', scope: scope(), executor }),
      { code: 'STUDIO_APPROVAL_NOT_FOUND', status: 403 },
    );
    const audit = await governance.listAudit(5);
    assert.equal(audit[0].decision, 'denied');
    assert.equal(audit[0].reasonCode, 'STUDIO_APPROVAL_NOT_FOUND');
  });
});

test('an approval is single-use, stored only as a hash, and replay is refused', async () => {
  await withGovernance(async (governance, stateDir) => {
    const { token, approval } = await governance.requestApproval({
      operationId: 'studio.stop_playtest',
      scope: scope(),
      approver: 'local-operator',
    });
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const first = await governance.execute({ operationId: 'studio.stop_playtest', token, scope: scope(), executor });
    assert.equal(first.result.ok, true);
    assert.equal(first.approval.id, approval.id);

    await assert.rejects(
      governance.execute({ operationId: 'studio.stop_playtest', token, scope: scope(), executor }),
      { code: 'STUDIO_APPROVAL_REPLAYED', status: 409 },
    );
    const stored = await fs.readFile(path.join(stateDir, 'approvals.json'), 'utf8');
    assert.ok(!stored.includes(token));
    const parsed = JSON.parse(stored);
    assert.match(parsed.approvals[0].tokenSha256, /^[0-9a-f]{64}$/);
    const audit = await governance.listAudit(10);
    assert.equal(audit.filter((entry) => entry.decision === 'succeeded' && entry.operationId === 'studio.stop_playtest').length, 1);
    assert.ok(audit.some((entry) => entry.decision === 'denied' && entry.reasonCode === 'STUDIO_APPROVAL_REPLAYED'));
  });
});

test('an approval is bound to the exact project, revision, Studio instance, place, and parameter digest', async () => {
  await withGovernance(async (governance) => {
    const mismatches = [
      ['project', 'misprint-menagerie'],
      ['sourceRevision', 'deadbee'],
      ['studioId', '7728ef66-4a93-452f-99be-c528aa2851a7'],
      ['placeName', 'other-place.rbxlx'],
      ['placeId', '123456'],
    ];
    for (const [key, value] of mismatches) {
      const { token } = await governance.requestApproval({
        operationId: 'studio.stop_playtest',
        scope: scope(),
        approver: 'local-operator',
      });
      await assert.rejects(
        governance.execute({ operationId: 'studio.stop_playtest', token, scope: scope({ [key]: value }), executor }),
        { code: 'STUDIO_APPROVAL_SCOPE_MISMATCH', status: 403 },
        `mismatched ${key} must be refused`,
      );
      const accepted = await governance.execute({ operationId: 'studio.stop_playtest', token, scope: scope(), executor });
      assert.equal(accepted.result.ok, true, `the unused token must still authorize ${key === 'project' ? 'its original scope' : key}`);
    }
    await assert.rejects(
      governance.execute({
        operationId: 'studio.stop_playtest',
        token: (await governance.requestApproval({ operationId: 'studio.stop_playtest', scope: scope(), approver: 'local-operator' })).token,
        scope: scope({ parameters: { datamodel_type: 'Edit', path: 'ServerScriptService' } }),
        executor,
      }),
      { code: 'STUDIO_APPROVAL_SCOPE_MISMATCH' },
    );
  });
});

test('an expired approval is refused before the executor runs', async () => {
  let now = new Date('2026-11-10T12:00:00.000Z');
  await withGovernance(async (governance) => {
    const { token } = await governance.requestApproval({
      operationId: 'studio.stop_playtest',
      scope: scope(),
      approver: 'local-operator',
      ttlMs: 15_000,
    });
    now = new Date('2026-11-10T12:00:16.000Z');
    let ran = false;
    await assert.rejects(
      governance.execute({ operationId: 'studio.stop_playtest', token, scope: scope(), executor: async () => { ran = true; } }),
      { code: 'STUDIO_APPROVAL_EXPIRED', status: 410 },
    );
    assert.equal(ran, false);
  }, { now: () => now });
});

test('two concurrent executions of one token allow exactly one to run', async () => {
  await withGovernance(async (governance) => {
    const { token } = await governance.requestApproval({
      operationId: 'studio.stop_playtest',
      scope: scope(),
      approver: 'local-operator',
    });
    let runs = 0;
    const slow = async () => { runs += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return { ok: true }; };
    const results = await Promise.allSettled([
      governance.execute({ operationId: 'studio.stop_playtest', token, scope: scope(), executor: slow }),
      governance.execute({ operationId: 'studio.stop_playtest', token, scope: scope(), executor: slow }),
    ]);
    assert.equal(results.filter((entry) => entry.status === 'fulfilled').length, 1);
    assert.equal(results.find((entry) => entry.status === 'rejected').reason.code, 'STUDIO_APPROVAL_REPLAYED');
    assert.equal(runs, 1);
  });
});

test('an executor failure is recorded as failed and consumes the approval', async () => {
  await withGovernance(async (governance) => {
    const { token } = await governance.requestApproval({
      operationId: 'studio.stop_playtest',
      scope: scope(),
      approver: 'local-operator',
    });
    await assert.rejects(
      governance.execute({
        operationId: 'studio.stop_playtest',
        token,
        scope: scope(),
        executor: async () => { throw Object.assign(new Error('Studio refused the request.'), { code: 'ENGINE_DENIED' }); },
      }),
      { code: 'STUDIO_OPERATION_FAILED', status: 502 },
    );
    const audit = await governance.listAudit(10);
    assert.ok(audit.some((entry) => entry.decision === 'failed' && entry.reasonCode === 'ENGINE_DENIED'));
    await assert.rejects(
      governance.execute({ operationId: 'studio.stop_playtest', token, scope: scope(), executor }),
      { code: 'STUDIO_APPROVAL_REPLAYED' },
    );
  });
});

test('approval issuance rejects inspections, malformed scopes, and out-of-range lifetimes', async () => {
  await withGovernance(async (governance) => {
    await assert.rejects(
      governance.requestApproval({ operationId: 'studio.read_state', scope: scope(), approver: 'local-operator' }),
      { code: 'STUDIO_APPROVAL_NOT_REQUIRED' },
    );
    await assert.rejects(
      governance.requestApproval({ operationId: 'studio.stop_playtest', scope: scope(), approver: 'local-operator', ttlMs: 1_000 }),
      { code: 'STUDIO_APPROVAL_TTL_INVALID' },
    );
    await assert.rejects(
      governance.requestApproval({ operationId: 'studio.stop_playtest', scope: scope({ project: '' }), approver: 'local-operator' }),
      { code: 'STUDIO_APPROVAL_SCOPE_INVALID' },
    );
    const issued = await governance.requestApproval({ operationId: 'studio.stop_playtest', scope: scope(), approver: 'local-operator' });
    assert.equal(issued.approval.scope.fingerprint, undefined);
  });
});

test('a corrupted approval store fails closed instead of granting approval', async () => {
  await withGovernance(async (governance, stateDir) => {
    await fs.writeFile(path.join(stateDir, 'approvals.json'), '{ broken');
    await assert.rejects(
      governance.requestApproval({ operationId: 'studio.stop_playtest', scope: scope(), approver: 'local-operator' }),
      { code: 'STUDIO_GOVERNANCE_STATE_INVALID', status: 500 },
    );
  });
});

test('the Lab exposes the read-only operation matrix and audit tail without a token', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), '11vated-studio-governance-api-'));
  const server = createLabServer({
    rootDir,
    studioClient: {
      getStatus: () => ({ state: 'disconnected', connected: false, tools: [] }),
      listStudios: async () => [],
      close: async () => {},
    },
  });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/studio/operations`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.riskClasses.length, 5);
    assert.ok(body.operations.some((entry) => entry.id === 'studio.publish_place' && entry.labExposed === false));
    assert.deepEqual(body.audit, []);
    for (const operation of body.operations) {
      assert.equal('token' in operation, false);
      assert.equal('tokenSha256' in operation, false);
    }
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});
