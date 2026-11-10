import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const powerShell = process.platform === 'win32' ? 'powershell.exe' : null;

async function startOccupiedPortServer() {
  const child = spawn(process.execPath, ['-e', `
    const http = require('node:http');
    const server = http.createServer((_request, response) => response.writeHead(404).end());
    server.listen(0, '127.0.0.1', () => process.stdout.write(String(server.address().port) + '\\n'));
  `], { stdio: ['ignore', 'pipe', 'pipe'] });

  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for the occupied-port fixture.')), 5000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/^(\d+)/m);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Occupied-port fixture exited before becoming ready (${code}): ${output}`));
    });
  });

  return { child, port };
}

test('failed launcher start removes only its own dead process record', { skip: !powerShell }, async (t) => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-start-script-'));
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));
  const scriptsDirectory = path.join(fixtureRoot, 'scripts');
  const serverDirectory = path.join(fixtureRoot, 'src', 'server');
  await fs.mkdir(scriptsDirectory, { recursive: true });
  await fs.mkdir(serverDirectory, { recursive: true });
  await fs.copyFile(path.join(workspaceRoot, 'scripts/start-lab.ps1'), path.join(scriptsDirectory, 'start-lab.ps1'));
  await fs.writeFile(path.join(serverDirectory, 'start.js'), `
const net = require('node:net');
const server = net.createServer();
server.on('error', (error) => {
  console.error(error.code);
  process.exitCode = 1;
});
server.listen(Number(process.env.LAB_PORT), '127.0.0.1');
`);

  const occupiedPort = await startOccupiedPortServer();
  t.after(() => occupiedPort.child.kill());
  const result = spawnSync(powerShell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptsDirectory, 'start-lab.ps1')], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, LAB_PORT: String(occupiedPort.port) },
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, 0, `occupied-port startup should fail: ${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /Lab exited during startup/i);
  assert.match(await fs.readFile(path.join(fixtureRoot, '.lab-runtime', 'logs', 'lab.stderr.log'), 'utf8'), /EADDRINUSE/);
  assert.equal(await fs.stat(path.join(fixtureRoot, '.lab-runtime', 'server.json')).then(() => true, () => false), false,
    'the failed launcher must remove its own dead PID record');
});
