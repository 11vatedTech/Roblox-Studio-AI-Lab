import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = path.join(workspaceRoot, 'scripts', 'run-luau-specs.ps1');
const pinnedLuauPath = path.join(workspaceRoot, '.tools', 'luau-0.745', 'luau.exe');
const skipReason = process.platform !== 'win32'
  ? 'The pinned Windows Luau CLI integration test runs on the supported Studio workstation.'
  : !fs.existsSync(pinnedLuauPath)
    ? 'Pinned Luau 0.745 is not installed on this workstation.'
    : false;

test('the Lab runs each Roblox-free Luau spec using its pinned CLI', { skip: skipReason }, () => {
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', runnerPath,
  ], { cwd: workspaceRoot, encoding: 'utf8', timeout: 60_000 });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `Luau spec runner failed:\n${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /PASS: 3 Luau CLI specs/);
});
