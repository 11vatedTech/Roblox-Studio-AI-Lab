#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { StudioMcpClient } from '../src/services/studio-mcp-client.js';
import { StudioGovernance, canonicalJson } from '../src/services/studio-governance.js';
import { persistStudioCapture } from '../src/services/capture-store.js';
import { captureSourceSnapshot } from './source-snapshot.mjs';
import { SANDBOX_PLACE_NAME, SANDBOX_PROJECT } from '../src/services/studio-sandbox-operations.js';

const ROOT = process.cwd();
const DEFAULT_OUT = 'evidence/studio';
const DEFAULT_PLACE_FILE = '.lab-runtime/sandbox/lab-empty.rbxlx';
const DEFAULT_STATE_ROOT = '.lab-runtime/studio-governance-sandbox';
const ALLOWED_FLAGS = new Set(['studio', 'place-file', 'revision', 'approver', 'out', 'state-dir', 'allow-dirty']);

function fail(message, code = 'STUDIO_GATE_PROBE_FAILED') {
  throw Object.assign(new Error(message), { code });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sha256File(filePath) {
  return sha256(await fs.readFile(filePath));
}

function parseFlags(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write([
      'Usage: npm run studio:gates -- --studio <id> [--place-file <path>] [--revision <commit>] [--approver <label>] [--out <dir>] [--state-dir <path>] [--allow-dirty]',
      '',
      'Drives a bounded single-client Play check and the Studio Device Simulator on the disposable lab-empty.rbxlx sandbox.',
      'It records BLOCKED_EXTERNAL evidence for two-client and physical-device gates when the live surface cannot satisfy them.',
    ].join('\n') + '\n');
    process.exit(0);
  }
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) fail(`Unexpected argument: ${raw}`);
    const key = raw.slice(2);
    if (!ALLOWED_FLAGS.has(key)) fail(`Unknown option: --${key}`);
    if (key === 'allow-dirty') {
      flags.set(key, true);
      continue;
    }
    if (flags.has(key)) fail(`Option --${key} was supplied twice.`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Option --${key} requires a value.`);
    flags.set(key, value);
    index += 1;
  }
  if (!flags.has('studio')) fail('Missing required option --studio.');
  return flags;
}

function currentRevision() {
  try {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', shell: false }).trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(revision)) throw new Error('not a full commit');
    return revision;
  } catch {
    fail('Could not determine the full source revision. Pass --revision explicitly.', 'STUDIO_GATE_REVISION_REQUIRED');
  }
}

function extractText(result) {
  return (result?.content ?? []).filter((item) => item?.type === 'text').map((item) => item.text).join('\n').trim();
}

function extractMode(text) {
  return /Current Studio Mode:\s*([A-Za-z]+)/i.exec(text)?.[1] ?? null;
}

function parseCount(text) {
  const match = /count=(\d+)/.exec(text ?? '');
  return match ? Number(match[1]) : null;
}

function parseField(text, key) {
  return new RegExp(`${key}=([^|]+)`).exec(text ?? '')?.[1] ?? null;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMode(client, studioId, expectedMode, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  while (Date.now() <= deadline) {
    lastText = extractText(await client.callReadTool('get_studio_state', { studio_id: studioId }));
    if (extractMode(lastText) === expectedMode) return lastText;
    await sleep(500);
  }
  fail(`Studio did not report ${expectedMode} within ${timeoutMs} ms. Last state: ${lastText || 'no text'}`, 'STUDIO_GATE_STATE_MISMATCH');
}

async function readAudit(stateDir) {
  const auditPath = path.join(stateDir, 'audit.jsonl');
  const bytes = await fs.readFile(auditPath);
  const entries = bytes.toString('utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return {
    path: path.relative(ROOT, auditPath).replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: sha256(bytes),
    entries,
  };
}

function buildToolSurface(client) {
  const inventory = client.getToolInventory();
  const names = inventory.tools.map((tool) => tool.name);
  const startStopPlay = inventory.tools.find((tool) => tool.name === 'start_stop_play') ?? null;
  const argumentsList = Object.keys(startStopPlay?.inputSchema?.properties ?? {});
  const multiClientOperationNames = names.filter((name) => /(^|_)(server|player|client|multiplayer|players)(_|$)/i.test(name));
  return {
    discoveredToolCount: inventory.discoveredToolCount,
    startStopPlay: {
      available: Boolean(startStopPlay),
      arguments: argumentsList,
      playerCountParameter: argumentsList.some((name) => ['num_players', 'player_count', 'players', 'client_count', 'clients'].includes(name)),
      clientSpawnParameter: ['client_count', 'clients', 'num_clients'].some((name) => argumentsList.includes(name)),
    },
    multiClientOperationNames,
    multiClientOperationCount: multiClientOperationNames.length,
    knownAbsentOperations: ['start_server', 'start_player', 'start_client', 'start_multiplayer', 'num_players'],
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const studioId = flags.get('studio');
  const placeName = SANDBOX_PLACE_NAME;
  const placeFile = path.resolve(ROOT, flags.get('place-file') ?? DEFAULT_PLACE_FILE);
  const sandboxRoot = path.resolve(ROOT, '.lab-runtime', 'sandbox') + path.sep;
  if (!placeFile.startsWith(sandboxRoot) || path.basename(placeFile) !== placeName) {
    fail('The gate probe only operates on the disposable .lab-runtime/sandbox/lab-empty.rbxlx file.', 'STUDIO_GATE_PLACE_INVALID');
  }
  const placeStat = await fs.lstat(placeFile).catch(() => null);
  if (!placeStat || placeStat.isSymbolicLink() || !placeStat.isFile()) {
    fail('The disposable sandbox place is missing or is not a regular file.', 'STUDIO_GATE_PLACE_INVALID');
  }
  const revision = flags.get('revision') ?? currentRevision();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(revision)) fail('--revision must be a full Git commit.');
  const approver = flags.get('approver') ?? 'project-owner-mission-20261110';
  if (approver.length > 100) fail('--approver is too long.');

  const outDir = path.resolve(ROOT, flags.get('out') ?? DEFAULT_OUT);
  const allowedOut = outDir.startsWith(path.resolve(ROOT, 'evidence') + path.sep)
    || outDir.startsWith(path.resolve(ROOT, '.lab-runtime') + path.sep);
  if (!allowedOut) fail('--out must stay under evidence/ or .lab-runtime/.', 'STUDIO_GATE_OUT_INVALID');
  await fs.mkdir(outDir, { recursive: true });

  const sourceIdentity = await captureSourceSnapshot(ROOT);
  if (sourceIdentity.dirty && !flags.get('allow-dirty')) {
    fail('The source tree is dirty. Commit the gate implementation before capturing clean evidence, or pass --allow-dirty for a local rehearsal.', 'STUDIO_GATE_SOURCE_DIRTY');
  }

  const stateDir = path.resolve(ROOT, flags.get('state-dir') ?? `${DEFAULT_STATE_ROOT}/${new Date().toISOString().replace(/[:.]/g, '-')}`);
  if (!stateDir.startsWith(path.resolve(ROOT, DEFAULT_STATE_ROOT) + path.sep)) {
    fail('The governance state directory must stay under .lab-runtime/studio-governance-sandbox.', 'STUDIO_GATE_STATE_DIR_INVALID');
  }
  await fs.mkdir(stateDir, { recursive: true });
  const governance = new StudioGovernance({ stateDir });
  const client = new StudioMcpClient({ timeoutMs: 30_000 });
  const operations = [];
  const failures = [];
  const initialHash = await sha256File(placeFile);
  const capturedAt = new Date().toISOString();
  let modeBefore = null;
  let modeAfterStart = null;
  let modeAfterStop = null;
  let liveInstance = null;
  let toolSurface = null;

  async function operation(operationId, parameters, executor) {
    const catalog = governance.getMatrix().operations.find((entry) => entry.id === operationId);
    if (!catalog) fail(`Unknown governed operation ${operationId}.`, 'STUDIO_GATE_OPERATION_UNKNOWN');
    const scope = {
      project: SANDBOX_PROJECT,
      sourceRevision: revision,
      studioId,
      placeName,
      placeId: '0',
      parameters,
    };
    let approval = null;
    let token = null;
    if (catalog.approvalRequired) {
      const issued = await governance.requestApproval({ operationId, scope, approver, ttlMs: 5 * 60_000 });
      token = issued.token;
      approval = issued.approval;
    }
    const execution = await governance.execute({
      operationId,
      token,
      scope,
      executor: async ({ scope: authorized }) => executor(authorized),
    });
    const record = {
      operationId,
      riskClass: catalog.riskClass,
      approvalId: approval?.id ?? null,
      executionId: execution.executionId,
      parameterDigest: approval?.scope?.parameterDigest ?? sha256(canonicalJson(parameters)),
      resultDigest: sha256(canonicalJson(execution.result)),
      requestedAt: approval?.requestedAt ?? null,
      expiresAt: approval?.expiresAt ?? null,
      result: execution.result,
    };
    operations.push(record);
    return record;
  }

  async function attempt(operationId, parameters, executor) {
    try {
      return { ok: true, record: await operation(operationId, parameters, executor) };
    } catch (error) {
      failures.push({ operationId, code: error?.code ?? 'STUDIO_GATE_OPERATION_FAILED', message: error?.message ?? 'Operation failed.' });
      return { ok: false };
    }
  }

  async function inspectPlayers(datamodelType) {
    const kind = datamodelType === 'Server' ? 'count_players_server' : 'count_players_client';
    const result = await attempt('studio.inspect_players', { datamodel_type: datamodelType }, async () => {
      const response = await client.callSandboxLuau(kind, studioId);
      return { datamodel_type: datamodelType, text: extractText(response).slice(0, 1000) };
    });
    if (!result.ok) return { ok: false };
    return {
      ok: true,
      text: result.record.result.text,
      count: parseCount(result.record.result.text),
      record: result.record,
    };
  }

  let started = false;
  let selectedDeviceText = null;
  let capture = null;
  let resetAttempt = null;

  try {
    await client.connect();
    const instances = await client.listStudios();
    liveInstance = instances.find((entry) => entry.studio_id === studioId);
    if (!liveInstance) fail('The approved sandbox Studio instance is not connected.', 'STUDIO_GATE_INSTANCE_NOT_FOUND');
    if (liveInstance.name !== placeName) fail(`The live instance name does not match ${placeName}. Live name: ${liveInstance.name ?? 'null'}.`, 'STUDIO_GATE_PLACE_MISMATCH');
    if (liveInstance.place_id !== undefined && liveInstance.place_id !== null && String(liveInstance.place_id) !== '0') {
      fail(`The live instance reports a non-local place ID ${liveInstance.place_id}.`, 'STUDIO_GATE_PLACE_MISMATCH');
    }
    toolSurface = buildToolSurface(client);
    modeBefore = extractMode(extractText(await client.callReadTool('get_studio_state', { studio_id: studioId })));
    if (modeBefore !== 'Edit') fail(`The sandbox must be in Edit mode before the gate probe; it reports ${modeBefore ?? 'unknown'}.`, 'STUDIO_GATE_STATE_MISMATCH');

    const start = await attempt('studio.start_playtest', { is_start: true }, async () => {
      const result = await client.callMutationTool('start_stop_play', { studio_id: studioId, is_start: true });
      return { tool: 'start_stop_play', is_start: true, text: extractText(result).slice(0, 1000) };
    });
    if (start.ok) {
      started = true;
      modeAfterStart = extractMode(await waitForMode(client, studioId, 'Play'));
      await sleep(800);
    }

    let serverPlayers = null;
    let clientPlayers = null;
    if (started) {
      serverPlayers = await inspectPlayers('Server');
      clientPlayers = await inspectPlayers('Client');
    }

    if (started) {
      const stop = await attempt('studio.stop_playtest', { is_start: false }, async () => {
        const result = await client.callMutationTool('start_stop_play', { studio_id: studioId, is_start: false });
        return { tool: 'start_stop_play', is_start: false, text: extractText(result).slice(0, 1000) };
      });
      if (stop.ok) {
        modeAfterStop = extractMode(await waitForMode(client, studioId, 'Edit'));
        if (modeAfterStop === 'Edit') started = false;
      }
    }

    const select = await attempt('studio.select_device_simulator', { selectionMode: 'latest-builtin-phone', datamodel_type: 'Edit' }, async () => {
      const result = await client.callSandboxLuau('select_device', studioId);
      return { tool: 'execute_luau', fixedProbe: 'select_device', text: extractText(result).slice(0, 1000) };
    });
    if (select.ok) {
      selectedDeviceText = select.record.result.text;
      if (!selectedDeviceText.startsWith('selected=')) {
        failures.push({ operationId: 'studio.select_device_simulator', code: 'DEVICE_SIMULATOR_SELECTION_FAILED', message: selectedDeviceText.slice(0, 300) });
      } else {
        try {
          const captureResult = await client.callReadTool('screen_capture', {
            studio_id: studioId,
            capture_id: randomUUID(),
          });
          const saved = await persistStudioCapture(ROOT, {
            studioId,
            project: SANDBOX_PROJECT,
            framing: null,
            result: captureResult,
            capturedAt: new Date().toISOString(),
          });
          capture = {
            id: saved.id,
            metadataPath: `evidence/studio/${saved.id}.json`,
            imagePath: `evidence/studio/${saved.imageName}`,
            bytes: saved.bytes,
            sha256: saved.sha256,
            capturedAt: saved.capturedAt,
            assessment: saved.assessment,
          };
        } catch (error) {
          failures.push({ operationId: 'studio.capture_device_viewport', code: error?.code ?? 'DEVICE_CAPTURE_FAILED', message: error?.message ?? 'Capture failed.' });
        }
      }
    }

    resetAttempt = await attempt('studio.reset_device_simulator', { selectionMode: 'default', datamodel_type: 'Edit' }, async () => {
      const result = await client.callSandboxLuau('reset_device', studioId);
      return { tool: 'execute_luau', fixedProbe: 'reset_device', text: extractText(result).slice(0, 1000) };
    });

    if (started) {
      const finalStop = await attempt('studio.stop_playtest', { is_start: false }, async () => {
        const result = await client.callMutationTool('start_stop_play', { studio_id: studioId, is_start: false });
        return { tool: 'start_stop_play', is_start: false, text: extractText(result).slice(0, 1000) };
      });
      if (finalStop.ok) {
        modeAfterStop = extractMode(await waitForMode(client, studioId, 'Edit'));
        if (modeAfterStop === 'Edit') started = false;
      }
    }
  } catch (error) {
    failures.push({ operationId: 'studio.gate_probe', code: error?.code ?? 'STUDIO_GATE_PROBE_FAILED', message: error?.message ?? 'Gate probe failed.' });
  } finally {
    if (started) {
      await attempt('studio.stop_playtest', { is_start: false }, async () => {
        const result = await client.callMutationTool('start_stop_play', { studio_id: studioId, is_start: false });
        return { tool: 'start_stop_play', is_start: false, text: extractText(result).slice(0, 1000) };
      });
    }
    await client.close();
  }

  const finalHash = await sha256File(placeFile);
  if (finalHash !== initialHash) failures.push({ operationId: 'studio.gate_probe', code: 'STUDIO_GATE_PLACE_CHANGED', message: 'The sandbox place file changed during a no-save gate probe.' });
  const audit = await readAudit(stateDir).catch((error) => ({ path: path.relative(ROOT, path.join(stateDir, 'audit.jsonl')).replaceAll('\\', '/'), error: error.message, entries: [] }));
  const observedServer = operations.filter((entry) => entry.operationId === 'studio.inspect_players' && entry.result?.datamodel_type === 'Server').at(-1)?.result?.text ?? null;
  const observedClient = operations.filter((entry) => entry.operationId === 'studio.inspect_players' && entry.result?.datamodel_type === 'Client').at(-1)?.result?.text ?? null;
  const serverCount = parseCount(observedServer);
  const clientCount = parseCount(observedClient);
  const singleClientObserved = serverCount === 1 && clientCount === 1;
  const startRecord = operations.find((entry) => entry.operationId === 'studio.start_playtest') ?? null;
  const stopRecord = operations.filter((entry) => entry.operationId === 'studio.stop_playtest').at(-1) ?? null;
  const selectRecord = operations.find((entry) => entry.operationId === 'studio.select_device_simulator') ?? null;
  const resetRecord = operations.find((entry) => entry.operationId === 'studio.reset_device_simulator') ?? null;
  const base = {
    schemaVersion: 1,
    project: 'lab',
    capturedAt,
    sourceIdentity,
    place: {
      path: path.relative(ROOT, placeFile).replaceAll('\\', '/'),
      name: placeName,
      initialSha256: initialHash,
      finalSha256: finalHash,
      changed: finalHash !== initialHash,
    },
    studio: {
      instanceId: studioId,
      name: liveInstance?.name ?? null,
      placeId: liveInstance?.place_id ?? null,
      modeBefore,
      modeAfterStart,
      modeAfterStop,
    },
    toolSurface,
    audit,
    failures,
    limitations: [
      'No save, upload, publish, Open Cloud call, or real-project mutation is performed by this probe.',
      'The source identity is recorded exactly; dirty evidence cannot support VERIFIED.',
      'The approval issuer label is supplied by the mission and is not cryptographically authenticated.',
    ],
  };

  const multiplayerRecord = {
    ...base,
    type: 'verification-run',
    status: 'blocked',
    title: 'Single-client Studio probe and multi-client surface audit',
    scope: 'One governed local Play session on the disposable lab-empty.rbxlx sandbox. The probe recorded the engine-owned Server and Client player lists, then stopped back to Edit. It also captured the exact start_stop_play schema and searched the live inventory for a player-count or client-spawn operation.',
    capabilityIds: ['LAB-GAME-001', 'LAB-QA-002', 'LAB-SEC-001'],
    blocker: {
      code: singleClientObserved && toolSurface?.multiClientOperationCount === 0
        ? 'STUDIO_MULTI_CLIENT_SURFACE_ABSENT'
        : 'MULTIPLAYER_GATE_NOT_SATISFIED',
      message: singleClientObserved
        ? 'The live MCP surface started one Server and one Client only; it exposes no player-count, start-server, or additional-client operation.'
        : 'The probe did not establish a stable two-client-capable surface.',
      humanAction: 'Use Studio’s native Clients and Servers UI or another supported multi-client runner to start a server with two real clients, then run the gate protocol; the current MCP start_stop_play operation accepts only is_start and studio_id.',
    },
    multiplayer: {
      observedServerPlayers: serverCount,
      observedClientPlayers: clientCount,
      observedServerText: observedServer,
      observedClientText: observedClient,
      startOperation: startRecord,
      stopOperation: stopRecord,
      startedAndStopped: Boolean(startRecord && stopRecord && modeAfterStop === 'Edit'),
    },
  };

  const deviceRecord = {
    ...base,
    type: 'verification-run',
    status: 'blocked',
    title: 'Studio Device Simulator probe and physical-device boundary',
    scope: 'Fixed StudioDeviceSimulatorService Luau selected the latest built-in phone, captured the viewport, and reset to the desktop device on the disposable sandbox. The run did not use a physical phone, touch hardware, or a thermal/performance session.',
    capabilityIds: ['LAB-QA-002', 'LAB-PERF-001'],
    blocker: {
      code: 'PHYSICAL_MIDRANGE_DEVICE_UNAVAILABLE',
      message: 'Studio Device Simulator is not a physical midrange phone; it cannot supply device identity, touch hardware, thermal behavior, or a 10–15 minute device profile.',
      humanAction: 'Connect a named representative midrange phone with developer mode, run the touch/controller loop and a 10–15 minute profile, and attach the device identity and measurements.',
    },
    device: {
      emulatorOnly: true,
      selectOperation: selectRecord,
      selectedText: selectedDeviceText,
      selectedDeviceId: parseField(selectedDeviceText, 'selected'),
      viewport: parseField(selectedDeviceText, 'viewport'),
      capture,
      resetOperation: resetRecord,
      emulatorStatus: capture && selectedDeviceText?.startsWith('selected=') ? 'passed' : 'failed',
    },
  };

  const multiplayerPath = path.join(outDir, 'lab-multiplayer-gate-probe-20261110.json');
  const devicePath = path.join(outDir, 'lab-device-emulator-probe-20261110.json');
  await fs.writeFile(multiplayerPath, `${JSON.stringify(multiplayerRecord, null, 2)}\n`);
  await fs.writeFile(devicePath, `${JSON.stringify(deviceRecord, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    multiplayerEvidence: path.relative(ROOT, multiplayerPath).replaceAll('\\', '/'),
    deviceEvidence: path.relative(ROOT, devicePath).replaceAll('\\', '/'),
    multiplayer: {
      status: multiplayerRecord.status,
      blocker: multiplayerRecord.blocker.code,
      serverPlayers: serverCount,
      clientPlayers: clientCount,
      multiClientOperationCount: toolSurface?.multiClientOperationCount ?? null,
      startStopArguments: toolSurface?.startStopPlay?.arguments ?? [],
      modeAfterStop,
    },
    device: {
      status: deviceRecord.status,
      emulatorStatus: deviceRecord.device.emulatorStatus,
      selectedDeviceId: deviceRecord.device.selectedDeviceId,
      viewport: deviceRecord.device.viewport,
      capture: capture ? { id: capture.id, bytes: capture.bytes, sha256: capture.sha256 } : null,
      blocker: deviceRecord.blocker.code,
    },
    failures,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: { code: error?.code ?? 'STUDIO_GATE_PROBE_FAILED', message: error?.message ?? 'Studio gate probe failed.' } })}\n`);
  process.exitCode = 1;
});
