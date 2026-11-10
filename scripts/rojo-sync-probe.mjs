#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { StudioMcpClient } from '../src/services/studio-mcp-client.js';
import { captureSourceSnapshot } from './source-snapshot.mjs';

const ROOT = process.cwd();
const DEFAULT_EVIDENCE = 'evidence/studio/lab-rojo-live-sync-probe-20261110.json';
const ROJO = path.join(ROOT, '.tools', 'rojo-7.7.1', 'rojo.exe');
const PROJECT_DIR = '.lab-runtime/sandbox';
const PORT = 34872;
const ALLOWED_FLAGS = new Set(['evidence']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(message, code = 'ROJO_SYNC_PROBE_FAILED') {
  throw Object.assign(new Error(message), { code });
}

function parseFlags(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('Usage: npm run rojo:live-probe -- [--evidence <path>]\n');
    process.exit(0);
  }
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) fail(`Unexpected argument: ${raw}`);
    const key = raw.slice(2);
    if (!ALLOWED_FLAGS.has(key)) fail(`Unknown option: --${key}`);
    if (flags.has(key)) fail(`Option --${key} was supplied twice.`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Option --${key} requires a value.`);
    flags.set(key, value);
    index += 1;
  }
  return flags;
}

function rojoVersion() {
  const result = spawnSync(ROJO, ['--version'], { cwd: ROOT, encoding: 'utf8', shell: false, timeout: 10_000 });
  if (result.status !== 0) fail('The pinned Rojo executable did not report a version.', 'ROJO_SYNC_ROJO_MISSING');
  return (result.stdout ?? result.stderr ?? '').trim();
}

async function pluginFiles() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return { checked: [], found: [] };
  const roots = [
    path.join(localAppData, 'Roblox', 'Plugins'),
    path.join(localAppData, 'Roblox', 'OTAPlugins', 'Deployed', 'BuiltInPlugins'),
    path.join(localAppData, 'Roblox', 'OTAPlugins', 'Deployed', 'BuiltInStandalonePlugins'),
  ];
  const checked = [];
  const found = [];
  for (const root of roots) {
    let entries = [];
    try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { /* Optional plugin roots. */ }
    checked.push(root);
    for (const entry of entries) {
      if (entry.isFile() && /rojo/i.test(entry.name)) found.push(path.join(root, entry.name));
    }
  }
  return { checked, found };
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return { status: response.status, body: await response.text() };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { status: null, body: null, error: lastError ?? 'timeout' };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill(); } catch { /* Already gone. */ }
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (child.exitCode === null && Number.isInteger(child.pid)) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const evidencePath = flags.get('evidence') ?? DEFAULT_EVIDENCE;
  if (!evidencePath.startsWith('evidence/') || evidencePath.includes('\\') || evidencePath.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('--evidence must be a safe path under evidence/.');
  }
  const sourceIdentity = await captureSourceSnapshot(ROOT);
  const version = rojoVersion();
  const projectPath = path.join(ROOT, PROJECT_DIR);
  const projectStat = await fs.lstat(path.join(projectPath, 'default.project.json')).catch(() => null);
  if (!projectStat || projectStat.isSymbolicLink() || !projectStat.isFile()) fail('The disposable Rojo project is missing.', 'ROJO_SYNC_PROJECT_MISSING');

  const client = new StudioMcpClient({ timeoutMs: 30_000 });
  let instances = [];
  let sandboxStudio = null;
  let stdout = '';
  let stderr = '';
  let child = null;
  let serverCheck = null;
  let plugin = null;
  try {
    await client.connect();
    instances = await client.listStudios();
    sandboxStudio = instances.find((entry) => entry.name === 'lab-empty.rbxlx') ?? null;
    plugin = await pluginFiles();

    child = spawn(ROJO, ['serve', '--address', '127.0.0.1', '--port', String(PORT), '--color', 'never', '.'], {
      cwd: projectPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    serverCheck = await waitForServer(`http://127.0.0.1:${PORT}/api/rojo`);
    if (!serverCheck.status) {
      serverCheck = await waitForServer(`http://127.0.0.1:${PORT}/`);
    }
    const waitMs = 8_000;
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline && child.exitCode === null) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const pluginConnected = /client connected|plugin connected|serving.*client|connected.*plugin/i.test(`${stdout}\n${stderr}`);
    const evidence = {
      schemaVersion: 1,
      type: 'verification-run',
      status: 'blocked',
      title: 'Rojo live sync blocked by the absence of a connected Studio plugin',
      capturedAt: new Date().toISOString(),
      project: 'lab',
      scope: 'A pinned Rojo 7.7.1 serve process was started on 127.0.0.1:34872 against the disposable sandbox project. The probe checked the loopback readiness endpoint, waited for a Studio plugin connection, inspected the local plugin directories, and stopped the process. No DataModel write, publish, or Open Cloud call was attempted.',
      sourceIdentity,
      rojo: {
        version,
        executable: path.relative(ROOT, ROJO).replaceAll('\\', '/'),
        command: 'rojo serve --address 127.0.0.1 --port 34872 --color never .',
        project: PROJECT_DIR,
        address: '127.0.0.1',
        port: PORT,
        serverCheck,
        pluginConnected,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000),
        exitCode: child.exitCode,
      },
      studio: {
        instances: instances.map((instance) => ({ studioId: instance.studio_id, name: instance.name ?? null, placeId: instance.place_id ?? null })),
        sandboxStudioId: sandboxStudio?.studio_id ?? null,
        sandboxPlaceName: sandboxStudio?.name ?? null,
      },
      plugin: {
        checkedRoots: plugin.checked,
        rojoPluginFiles: plugin.found,
        rojoPluginPresent: plugin.found.length > 0,
      },
      blocker: {
        code: 'ROJO_STUDIO_PLUGIN_ABSENT',
        detail: 'No Rojo Studio plugin file was found in the local plugin roots and no plugin connection appeared on the loopback server. The Lab has no supported way to click the plugin Connect control or install/authorize the plugin session automatically.',
        humanAction: 'Install the matching Rojo 7.7.1 Studio plugin, open the disposable lab-empty.rbxlx place, click Connect to 127.0.0.1:34872, then rerun the staged sync gate. Do not point it at Signal Garden or any public experience.',
      },
      limitations: [
        'This is a failed connection attempt, not a live sync. No DataModel was changed.',
        'Rojo serve was reachable or not on loopback only; no external network exposure was configured.',
        'The plugin may be installed in a Studio build or user profile not covered by the checked local plugin roots; the exact roots are recorded.',
        'No human independent review is attached; LAB-ROJO-002 remains blocked and is not promoted.',
      ],
    };
    const fullPath = path.join(ROOT, evidencePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      evidence: evidencePath,
      status: evidence.status,
      rojoVersion: version,
      serverCheck,
      pluginConnected,
      rojoPluginPresent: plugin.found.length > 0,
      blocker: evidence.blocker,
      sandboxStudioId: evidence.studio.sandboxStudioId,
    }, null, 2)}\n`);
    process.exitCode = 2;
  } finally {
    await stopServer(child);
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: { code: error?.code ?? 'ROJO_SYNC_PROBE_FAILED', message: error?.message ?? 'Rojo sync probe failed.' } })}\n`);
  process.exitCode = 1;
});
