import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { listCaptures, persistStudioCapture, readCapture } from '../src/services/capture-store.js';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

test('persists a real image block with Studio and project provenance', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-captures-'));
  try {
    const saved = await persistStudioCapture(root, {
      studioId: 'studio-1',
      project: 'signal-garden',
      result: { content: [{ type: 'image', mimeType: 'image/png', data: png.toString('base64') }] },
      capturedAt: '2026-11-06T12:00:00.000Z',
    });
    assert.equal(saved.mimeType, 'image/png');
    assert.equal(saved.studioId, 'studio-1');
    assert.equal(saved.project, 'signal-garden');
    assert.deepEqual(saved.assessment, { status: 'unreviewed', note: null });
    assert.deepEqual((await readCapture(root, saved.id)).bytes, png);
    assert.equal((await listCaptures(root))[0].assessment.status, 'unreviewed');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid ids, image signatures, and untrusted capture metadata', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-captures-'));
  try {
    await assert.rejects(readCapture(root, '../outside'), { code: 'CAPTURE_NOT_FOUND' });
    await assert.rejects(persistStudioCapture(root, {
      studioId: 'studio-1', result: { content: [{ type: 'image', mimeType: 'image/png', data: Buffer.from('not png').toString('base64') }] },
    }), { code: 'CAPTURE_IMAGE_INVALID' });
    await assert.rejects(persistStudioCapture(root, {
      studioId: 'studio-1', project: '../private', result: { content: [{ type: 'image', mimeType: 'image/png', data: png.toString('base64') }] },
    }), { code: 'INVALID_PROJECT_NAME' });
    await assert.rejects(persistStudioCapture(root, {
      studioId: 'studio-1', framing: { cameraPosition: [0, Number.POSITIVE_INFINITY, 0] },
      result: { content: [{ type: 'image', mimeType: 'image/png', data: png.toString('base64') }] },
    }), { code: 'CAPTURE_FRAMING_INVALID' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('orders captured evidence by capture time rather than random ids', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-captures-'));
  try {
    await persistStudioCapture(root, { studioId: 'studio-1', result: { content: [{ type: 'image', mimeType: 'image/png', data: png.toString('base64') }] }, capturedAt: '2026-11-06T10:00:00.000Z' });
    await persistStudioCapture(root, { studioId: 'studio-1', result: { content: [{ type: 'image', mimeType: 'image/png', data: png.toString('base64') }] }, capturedAt: '2026-11-07T10:00:00.000Z' });
    const captures = await listCaptures(root);
    assert.equal(captures.length, 2);
    assert.equal(captures[0].capturedAt, '2026-11-07T10:00:00.000Z');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
