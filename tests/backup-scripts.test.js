import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const powerShell = process.platform === 'win32' ? 'powershell.exe' : null;

test('backup script creates a unique archive on Windows PowerShell 5.1', { skip: !powerShell }, async (t) => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-backup-script-'));
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));

  const requiredFiles = [
    '.agents/skills/roblox-production-lab/SKILL.md',
    'src/server/app.js',
    'tests/path-policy.test.js',
    'package.json',
  ];
  const roots = ['.agents', 'apps', 'src', 'tests', 'evidence', 'docs', 'projects', 'assets', 'skills', 'roblox', 'scripts'];
  for (const root of roots) await fs.mkdir(path.join(fixtureRoot, root), { recursive: true });
  for (const relativePath of requiredFiles) {
    const target = path.join(fixtureRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `fixture ${relativePath}\n`);
  }
  for (const relativePath of ['scripts/backup.ps1', 'scripts/verify-backup.ps1']) {
    await fs.copyFile(path.join(workspaceRoot, relativePath), path.join(fixtureRoot, relativePath));
  }
  await fs.writeFile(path.join(fixtureRoot, 'run-backup-test.ps1'), `
function Get-FileHash {
  param([string]$LiteralPath, [string]$Algorithm)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($LiteralPath)
  try { $hash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
  finally { $stream.Dispose(); $sha.Dispose() }
  return [pscustomobject]@{ Hash = $hash }
}
& (Join-Path $PSScriptRoot 'scripts/backup.ps1')
`);

  const result = spawnSync(powerShell, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(fixtureRoot, 'run-backup-test.ps1'),
  ], { cwd: fixtureRoot, encoding: 'utf8', timeout: 30_000 });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `backup command failed: ${result.stderr}\n${result.stdout}`);
  const archiveDirectory = path.join(fixtureRoot, '.lab-backups');
  const archives = (await fs.readdir(archiveDirectory)).filter((name) => name.endsWith('.zip'));
  assert.equal(archives.length, 1, 'backup should create exactly one uniquely named archive');
  const archiveStat = await fs.stat(path.join(archiveDirectory, archives[0]));
  assert.ok(archiveStat.size > 0, 'backup archive should contain data');
  assert.match(result.stdout, /manifest\.json \(SHA-256 per included source file\)/);
});
