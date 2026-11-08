import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabServer } from '../src/server/app.js';

function createTestServer({ referenceClient } = {}) {
  const calls = { studioClose: 0 };
  const server = createLabServer({
    ...(referenceClient ? { referenceClient } : {}),
    studioClient: {
      async close() {
        calls.studioClose += 1;
      },
    },
  });
  return { server, calls };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function waitForClosed(server, calls, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while ((server.listening || calls.studioClose === 0) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(server.listening, false, 'HTTP server should close before shutdown is reported complete');
  assert.equal(calls.studioClose, 1, 'Studio MCP cleanup should run exactly once');
}

test('POST /api/shutdown returns an acknowledgement then drains and closes the service', async (t) => {
  const { server, calls } = createTestServer();
  const baseUrl = await listen(server);
  t.after(async () => {
    if (server.listening) await server.shutdown().catch(() => {});
  });

  const response = await fetch(`${baseUrl}/api/shutdown`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { status: 'shutting_down' });
  await waitForClosed(server, calls);
});

test('shutdown endpoint rejects cross-origin state changes', async (t) => {
  const { server, calls } = createTestServer();
  const baseUrl = await listen(server);
  t.after(async () => {
    if (server.listening) await server.shutdown().catch(() => {});
  });

  const response = await fetch(`${baseUrl}/api/shutdown`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://attacker.example',
    },
    body: '{}',
  });

  assert.equal(response.status, 403);
  assert.equal(server.listening, true);
  await server.shutdown();
  await waitForClosed(server, calls);
});

test('server shutdown is idempotent and awaits one Studio MCP cleanup', async () => {
  const { server, calls } = createTestServer();
  await listen(server);

  const first = server.shutdown();
  const second = server.shutdown();
  assert.equal(first, second, 'concurrent shutdown calls should share one completion promise');
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.deepEqual(firstResult, { status: 'stopped', forcedConnectionsClosed: false });
  assert.deepEqual(secondResult, firstResult);
  assert.equal(server.listening, false);
  assert.equal(calls.studioClose, 1);
});


test('server drains an in-flight HTTP request before disconnecting Studio MCP', async (t) => {
  let releaseRequest;
  let markRequestStarted;
  const requestStarted = new Promise((resolve) => { markRequestStarted = resolve; });
  const referenceClient = {
    async getClass() {
      markRequestStarted();
      return await new Promise((resolve) => { releaseRequest = () => resolve({ className: 'Part' }); });
    },
  };
  const { server, calls } = createTestServer({ referenceClient });
  const baseUrl = await listen(server);
  t.after(async () => {
    if (server.listening) await server.shutdown().catch(() => {});
    if (releaseRequest) releaseRequest();
  });

  const requestPromise = fetch(`${baseUrl}/api/engine/class?name=Part`);
  await requestStarted;
  const shutdownPromise = server.shutdown({ timeoutMs: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(calls.studioClose, 0, 'Studio MCP must remain available while an HTTP request is draining');
  releaseRequest();

  const response = await requestPromise;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { className: 'Part' });
  await shutdownPromise;
  await waitForClosed(server, calls);
});

test('server shutdown rejects unsafe timeout values without starting shutdown', async (t) => {
  const { server, calls } = createTestServer();
  await listen(server);
  t.after(async () => {
    if (server.listening) await server.shutdown().catch(() => {});
  });

  await assert.rejects(server.shutdown({ timeoutMs: 99 }), /100 to 60000 milliseconds/);
  assert.equal(server.listening, true);
  assert.equal(calls.studioClose, 0);
  await server.shutdown();
  await waitForClosed(server, calls);
});
