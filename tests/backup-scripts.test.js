import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const powerShell = process.platform === 'win32' ? 'powershell.exe' : null;
const roots = ['.agents', 'apps', 'src', 'tests', 'evidence', 'docs', 'projects', 'assets', 'skills', 'roblox', 'scripts'];

async function createBackupFixture(t) {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-backup-script-'));
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));

  const requiredFiles = [
    '.agents/skills/roblox-production-lab/SKILL.md',
    'src/server/app.js',
    'tests/path-policy.test.js',
    'package.json',
    '.env',
    '.env.example',
    'src/.env.local',
    'src/secrets/credential.txt',
  ];
  for (const root of roots) {
    await fs.mkdir(path.join(fixtureRoot, root), { recursive: true });
    await fs.writeFile(path.join(fixtureRoot, root, 'fixture.txt'), `fixture root ${root}\n`);
  }
  for (const relativePath of requiredFiles) {
    const target = path.join(fixtureRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `fixture ${relativePath}\n`);
  }
  for (const relativePath of ['scripts/backup.ps1', 'scripts/verify-backup.ps1']) {
    await fs.copyFile(path.join(workspaceRoot, relativePath), path.join(fixtureRoot, relativePath));
  }
  return fixtureRoot;
}

function runPowerShell(fixtureRoot, name, script) {
  const scriptPath = path.join(fixtureRoot, name);
  const hashFunction = `
function Get-FileHash {
  param([string]$LiteralPath, [string]$Algorithm)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($LiteralPath)
  try { $hash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
  finally { $stream.Dispose(); $sha.Dispose() }
  return [pscustomobject]@{ Hash = $hash }
}
`;
  return fs.writeFile(scriptPath, `${hashFunction}\n${script}`).then(() => spawnSync(powerShell, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
  ], { cwd: fixtureRoot, encoding: 'utf8', timeout: 30_000, env: { ...process.env, TEMP: fixtureRoot, TMP: fixtureRoot } }));
}

test('backup script creates a unique archive and restores every included file on Windows PowerShell 5.1', { skip: !powerShell }, async (t) => {
  const fixtureRoot = await createBackupFixture(t);
  const result = await runPowerShell(fixtureRoot, 'run-backup-test.ps1', `
& (Join-Path $PSScriptRoot 'scripts/backup.ps1')
$archive = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '.lab-backups') -Filter '*.zip' | Select-Object -First 1
& (Join-Path $PSScriptRoot 'scripts/verify-backup.ps1') -ArchivePath $archive.FullName
$zip = [System.IO.Compression.ZipFile]::OpenRead($archive.FullName)
try {
  $names = @($zip.Entries | ForEach-Object FullName)
  if ($names -contains '.env' -or $names -contains 'src/.env.local' -or $names -contains 'src/secrets/credential.txt') { throw 'Backup included secret-like paths.' }
  if ($names -notcontains '.env.example') { throw 'Backup omitted the non-secret environment example.' }
} finally { $zip.Dispose() }
$leakedRestore = Get-ChildItem -LiteralPath $PSScriptRoot -Directory -Filter 'lab-backup-restore-*' -ErrorAction SilentlyContinue
if ($leakedRestore) { throw 'The successful restore left temporary files behind.' }
`);

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `backup or restore command failed: ${result.stderr}\n${result.stdout}`);
  const archiveDirectory = path.join(fixtureRoot, '.lab-backups');
  const archives = (await fs.readdir(archiveDirectory)).filter((name) => name.endsWith('.zip'));
  assert.equal(archives.length, 1, 'backup should create exactly one uniquely named archive');
  const archiveStat = await fs.stat(path.join(archiveDirectory, archives[0]));
  assert.ok(archiveStat.size > 0, 'backup archive should contain data');
  assert.match(result.stdout, /manifest\.json \(SHA-256 per included source file\)/);
  assert.match(result.stdout, /Result\s+: PASS/, 'restore should report a verified result');
  assert.match(result.stdout, /Hashes\s+: All restored files match manifest SHA-256 and byte length\./);
});

test('backup supports an in-workspace destination and rejects path escape', { skip: !powerShell }, async (t) => {
  const fixtureRoot = await createBackupFixture(t);
  const result = await runPowerShell(fixtureRoot, 'run-backup-destination-test.ps1', `
$archivePath = Join-Path $PSScriptRoot 'portable/export/lab.zip'
& (Join-Path $PSScriptRoot 'scripts/backup.ps1') -ArchivePath $archivePath
if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) { throw 'The requested package archive was not created.' }
$escapePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'outside.zip'
try {
  & (Join-Path $PSScriptRoot 'scripts/backup.ps1') -ArchivePath $escapePath
  exit 0
} catch {
  Write-Output $_.Exception.Message
  exit 42
}
`);

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 42, `workspace escape should be rejected: ${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /inside the Lab workspace/i);
  assert.equal(await fs.stat(path.join(fixtureRoot, 'portable', 'export', 'lab.zip')).then(() => true, () => false), true);
  assert.equal(await fs.stat(path.join(path.dirname(fixtureRoot), 'outside.zip')).then(() => true, () => false), false);
});

test('backup verifier rejects a path traversal entry before extraction', { skip: !powerShell }, async (t) => {
  const fixtureRoot = await createBackupFixture(t);
  const result = await runPowerShell(fixtureRoot, 'run-malicious-archive-test.ps1', `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$archivePath = Join-Path $PSScriptRoot 'malicious.zip'
$archiveFile = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
$zip = [System.IO.Compression.ZipArchive]::new($archiveFile, [System.IO.Compression.ZipArchiveMode]::Create, $true)
try {
  $entry = $zip.CreateEntry('../outside.txt')
  $writer = [System.IO.StreamWriter]::new($entry.Open())
  try { $writer.Write('outside') } finally { $writer.Dispose() }
} finally { $zip.Dispose(); $archiveFile.Dispose() }
try {
  & (Join-Path $PSScriptRoot 'scripts/verify-backup.ps1') -ArchivePath $archivePath
  exit 0
} catch {
  Write-Output $_.Exception.Message
  exit 42
}
`);

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 42, `traversal entry should be rejected: ${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /unsafe entry path|escapes the restore directory/i);
  assert.equal(await fs.stat(path.join(fixtureRoot, 'outside.txt')).then(() => true, () => false), false);
});

test('backup verifier detects content changed after the manifest was written', { skip: !powerShell }, async (t) => {
  const fixtureRoot = await createBackupFixture(t);
  const result = await runPowerShell(fixtureRoot, 'run-corrupt-archive-test.ps1', `
Add-Type -AssemblyName System.IO.Compression.FileSystem
& (Join-Path $PSScriptRoot 'scripts/backup.ps1')
$archive = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '.lab-backups') -Filter '*.zip' | Select-Object -First 1
$zip = [System.IO.Compression.ZipFile]::Open($archive.FullName, [System.IO.Compression.ZipArchiveMode]::Update)
try {
  $entry = $zip.GetEntry('src/server/app.js')
  $entry.Delete()
  $replacement = $zip.CreateEntry('src/server/app.js')
  $writer = [System.IO.StreamWriter]::new($replacement.Open())
  try { $writer.Write('tampered content') } finally { $writer.Dispose() }
} finally { $zip.Dispose() }
try {
  & (Join-Path $PSScriptRoot 'scripts/verify-backup.ps1') -ArchivePath $archive.FullName
  exit 0
} catch {
  Write-Output $_.Exception.Message
  exit 42
}
`);

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 42, `modified archive should fail integrity verification: ${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /hash or length does not match its manifest/i);
});
