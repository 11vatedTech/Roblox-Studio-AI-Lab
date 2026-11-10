import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { captureSourceSnapshot } from '../scripts/source-snapshot.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('captures a deterministic source-tree digest that changes with source edits but excludes evidence artifacts', async () => {
  const runtimeRoot = path.join(repositoryRoot, '.lab-runtime');
  await fs.mkdir(runtimeRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(runtimeRoot, 'source-snapshot-test-'));
  try {
    execFileSync('git', ['init', '--initial-branch=main', root], { stdio: 'ignore' });
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Lab Snapshot Test'], { stdio: 'ignore' });
    execFileSync('git', ['-C', root, 'config', 'user.email', 'snapshot-test@example.invalid'], { stdio: 'ignore' });
    await fs.mkdir(path.join(root, 'evidence'), { recursive: true });
    await fs.writeFile(path.join(root, 'README.md'), 'initial source\n');
    await fs.writeFile(path.join(root, 'evidence', 'run.json'), '{}\n');
    execFileSync('git', ['-C', root, 'add', 'README.md', 'evidence/run.json'], { stdio: 'ignore' });
    execFileSync('git', ['-C', root, 'commit', '-m', 'snapshot fixture'], { stdio: 'ignore' });

    const first = await captureSourceSnapshot(root, { excludedRoots: ['evidence'] });
    await fs.writeFile(path.join(root, 'evidence', 'run.json'), '{"new":true}\n');
    const evidenceOnlyChange = await captureSourceSnapshot(root, { excludedRoots: ['evidence'] });
    assert.equal(first.treeSha256, evidenceOnlyChange.treeSha256);
    assert.equal(first.commit, evidenceOnlyChange.commit);
    assert.equal(evidenceOnlyChange.dirty, false);

    await fs.writeFile(path.join(root, 'README.md'), 'changed source\n');
    const sourceChange = await captureSourceSnapshot(root, { excludedRoots: ['evidence'] });
    assert.notEqual(sourceChange.treeSha256, first.treeSha256);
    assert.equal(sourceChange.dirty, true);
    assert.match(sourceChange.commit, /^[a-f0-9]{40}$/);
    assert.match(sourceChange.treeSha256, /^[a-f0-9]{64}$/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
