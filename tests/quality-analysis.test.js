import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeProject } from '../src/services/quality-analysis.js';

test('flags dynamic Luau execution and unvalidated server remote handlers with concrete locations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '11vated-quality-'));
  try {
    await fs.mkdir(path.join(root, 'src', 'server'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'server', 'Unsafe.server.luau'), [
      'local Remote = game.ReplicatedStorage.Remote',
      'Remote.OnServerEvent:Connect(function(player, value)',
      '    loadstring(value)()',
      'end)',
    ].join('\n'));
    const report = await analyzeProject(root);
    assert.equal(report.filesScanned, 1);
    assert.ok(report.findings.some((finding) => finding.rule === 'dynamic-code-execution' && finding.line === 3 && finding.severity === 'high'));
    assert.ok(report.findings.some((finding) => finding.rule === 'remote-handler-review' && finding.line === 2 && finding.severity === 'review'));
    assert.equal(report.certified, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('reports an empty project as unmeasured instead of passing it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '11vated-quality-empty-'));
  try {
    const report = await analyzeProject(root);
    assert.equal(report.filesScanned, 0);
    assert.equal(report.certified, false);
    assert.equal(report.summary.status, 'unmeasured');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
