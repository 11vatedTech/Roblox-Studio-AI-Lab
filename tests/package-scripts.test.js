import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const powerShell = process.platform === 'win32' ? 'powershell.exe' : null;

test('portable package records pinned tools and excludes mutable state and secret paths', { skip: !powerShell }, async (t) => {
  const packageDirectory = path.join(workspaceRoot, '.lab-runtime', 'test-packages');
  const packagePath = path.join(packageDirectory, `lab-portable-test-${process.pid}-${Date.now()}.zip`);
  const fixtureDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-package-inspect-'));
  const inspectPath = path.join(fixtureDirectory, 'inspect-package.ps1');
  t.after(async () => {
    await fs.rm(packagePath, { force: true });
    await fs.rm(packageDirectory, { recursive: true, force: true });
    await fs.rm(fixtureDirectory, { recursive: true, force: true });
  });

  const packageResult = spawnSync(powerShell, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(workspaceRoot, 'scripts', 'package-lab.ps1'),
    '-OutputPath', packagePath, '-SkipExtractionVerification',
  ], { cwd: workspaceRoot, encoding: 'utf8', timeout: 90_000 });
  assert.equal(packageResult.error, undefined, packageResult.error?.message);
  assert.equal(packageResult.status, 0, `package creation failed: ${packageResult.stderr}\n${packageResult.stdout}`);
  assert.match(packageResult.stdout, /Result\s+: PASS/);

  await fs.writeFile(inspectPath, `
param([string]$PackagePath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($PackagePath)
try {
  $entry = $archive.GetEntry('manifest.json')
  if (-not $entry) { throw 'Package manifest is missing.' }
  $reader = [System.IO.StreamReader]::new($entry.Open())
  try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  if ($manifest.package.format -ne 'lab-portable-source-toolchain' -or $manifest.package.rojoVersion -ne '7.7.1' -or $manifest.package.luauVersion -ne '0.745') { throw 'Pinned tool versions are missing.' }
  if ($manifest.package.bundledNodeRuntime -ne $false -or $manifest.package.nodeMinimumMajor -ne 20) { throw 'Node runtime requirements are misleading.' }
  $paths = @($manifest.files | ForEach-Object { ([string]$_.path).Replace('\\', '/') })
  foreach ($required in @('.tools/rojo-7.7.1/rojo.exe', '.tools/luau-0.745/luau.exe', '.tools/luau-0.745/luau-analyze.exe', '.tools/luau-0.745/luau-compile.exe', 'package.json', 'scripts/test-all.ps1', 'scripts/backup.ps1', 'scripts/package-lab.ps1', 'scripts/verify-package.ps1', 'docs/workflows/portable-package.md')) {
    if ($paths -notcontains $required) { throw "Package is missing required file $required." }
  }
  foreach ($path in $paths) {
    if ($path -match '(^|/)(\.git|node_modules|\.lab-runtime|\.lab-backups)(/|$)' -or $path -match '(^|/)\.env($|\.(?!example$))' -or $path -match '(^|/)(?i:secrets?|credentials?)(/|$)') {
      throw "Package contains excluded path $path."
    }
  }
  if ($manifest.fileCount -ne $paths.Count) { throw 'Package file count does not match the manifest.' }
  Write-Output 'PACKAGE-CONTENTS-PASS'
} finally { $archive.Dispose() }
`);
  const inspectResult = spawnSync(powerShell, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', inspectPath, '-PackagePath', packagePath,
  ], { cwd: workspaceRoot, encoding: 'utf8', timeout: 15_000 });
  assert.equal(inspectResult.error, undefined, inspectResult.error?.message);
  assert.equal(inspectResult.status, 0, `package contents were invalid: ${inspectResult.stderr}\n${inspectResult.stdout}`);
  assert.match(inspectResult.stdout, /PACKAGE-CONTENTS-PASS/);
  assert.ok((await fs.stat(packagePath)).size > 0);
});
