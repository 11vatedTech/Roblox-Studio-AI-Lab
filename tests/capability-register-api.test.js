import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createLabServer } from '../src/server/app.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the Lab API and control-room overview expose the same corrected acceptance register', async () => {
  const server = createLabServer({ rootDir: repositoryRoot });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/capabilities`);
    const register = await response.json();
    assert.equal(response.status, 200, JSON.stringify(register));
    assert.ok(register.capabilities.some((item) => item.id === 'LAB-ROJO-001' && item.status === 'IN_PROGRESS'));
    assert.ok(register.capabilities.some((item) => item.id === 'LAB-RECOVERY-001' && item.status === 'IN_PROGRESS'));
    assert.ok(register.summary.open > 0);

    const evidenceResponse = await fetch(`${baseUrl}/api/evidence`);
    const evidence = await evidenceResponse.json();
    assert.equal(evidenceResponse.status, 200, JSON.stringify(evidence));
    assert.ok(evidence.records.some((item) => item.id === 'evidence.studio.signal-garden-local-multiplayer-20261107'));
    assert.ok(evidence.summary.total >= 2);

    const overviewResponse = await fetch(`${baseUrl}/api/overview`);
    const overview = await overviewResponse.json();
    assert.equal(overviewResponse.status, 200, JSON.stringify(overview));
    assert.deepEqual(overview.capabilities.summary, register.summary);
    assert.deepEqual(overview.evidence.summary, evidence.summary);
    assert.ok(overview.capabilities.openItems.some((item) => item.status !== 'VERIFIED'));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
