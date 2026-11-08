import test from 'node:test';
import assert from 'node:assert/strict';
import { RobloxReferenceClient } from '../src/services/roblox-reference.js';

const WORKSPACE_REFERENCE = `name: Workspace
type: class
summary: |
  Holds objects that exist in the 3D world.
inherits:
  - WorldRoot
properties:
  - name: Workspace.CurrentCamera
    summary: |
      The camera object used by the local player.
    type: Camera
    thread_safety: ReadSafe
methods:
  - name: Workspace.GetPartBoundsInBox
    summary: |
      Returns parts whose bounding boxes overlap the query box.
    type: Instances
    thread_safety: Safe
events:
  - name: Workspace.GravityChanged
    summary: |
      Fires when gravity changes.
`;

function referenceResponse(body, status = 200) {
  return new Response(body, { status, headers: { etag: '"docs-revision-1"', 'content-type': 'text/plain' } });
}

test('retrieves official class metadata and filters indexed API members', async () => {
  const requests = [];
  const client = new RobloxReferenceClient({ fetchImpl: async (url) => { requests.push(String(url)); return referenceResponse(WORKSPACE_REFERENCE); } });
  const result = await client.getClass('Workspace', 'bounds');

  assert.equal(result.class, 'Workspace');
  assert.equal(result.summary, 'Holds objects that exist in the 3D world.');
  assert.deepEqual(result.inherits, ['WorldRoot']);
  assert.equal(result.members.properties.length, 0);
  assert.equal(result.members.methods[0].name, 'GetPartBoundsInBox');
  assert.equal(result.members.methods[0].type, 'Instances');
  assert.equal(result.members.methods[0].summary, 'Returns parts whose bounding boxes overlap the query box.');
  assert.equal(result.members.events.length, 0);
  assert.equal(result.source, 'official_roblox_creator_docs');
  assert.equal(result.sourceRevision, '"docs-revision-1"');
  assert.deepEqual(requests, ['https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Workspace.yaml']);
});

test('caches a class response and exposes all member categories on an unfiltered query', async () => {
  let requestCount = 0;
  const client = new RobloxReferenceClient({ fetchImpl: async () => { requestCount += 1; return referenceResponse(WORKSPACE_REFERENCE); } });
  const first = await client.getClass('Workspace');
  const second = await client.getClass('Workspace', 'camera');

  assert.equal(requestCount, 1);
  assert.equal(first.members.properties[0].name, 'CurrentCamera');
  assert.equal(first.members.methods[0].name, 'GetPartBoundsInBox');
  assert.equal(first.members.events[0].name, 'GravityChanged');
  assert.equal(second.members.properties[0].name, 'CurrentCamera');
  assert.equal(second.members.methods.length, 0);
});

test('rejects unsafe class and search inputs before making a request', async () => {
  let requestCount = 0;
  const client = new RobloxReferenceClient({ fetchImpl: async () => { requestCount += 1; return referenceResponse(WORKSPACE_REFERENCE); } });
  await assert.rejects(client.getClass('../Workspace'), { code: 'INVALID_ENGINE_CLASS', status: 400 });
  await assert.rejects(client.getClass('Workspace', 'x'.repeat(101)), { code: 'INVALID_REFERENCE_SEARCH', status: 400 });
  assert.equal(requestCount, 0);
});

test('reports missing classes from the upstream API reference as not found', async () => {
  const client = new RobloxReferenceClient({ fetchImpl: async () => referenceResponse('not found', 404) });
  await assert.rejects(client.getClass('NotARealRobloxClass'), { code: 'ENGINE_CLASS_NOT_FOUND', status: 404 });
});
