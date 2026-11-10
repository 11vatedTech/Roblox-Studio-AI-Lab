#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { StudioMcpClient } from '../src/services/studio-mcp-client.js';
import { StudioGovernance, canonicalJson } from '../src/services/studio-governance.js';
import {
  SANDBOX_DELETE_CODE,
  SANDBOX_PLACE_NAME,
  SANDBOX_PROBE_V1,
  SANDBOX_PROBE_V2,
  SANDBOX_PROJECT,
  SANDBOX_SCRIPT_CLASS,
  SANDBOX_SCRIPT_PATH,
  SANDBOX_UPLOAD_IMAGE_RELATIVE,
} from '../src/services/studio-sandbox-operations.js';
import { captureSourceSnapshot } from './source-snapshot.mjs';

const ROOT = process.cwd();
const DEFAULT_EVIDENCE = 'evidence/studio/lab-studio-sandbox-probe-20261110.json';
const DEFAULT_STATE_ROOT = '.lab-runtime/studio-governance-sandbox';
const DEFAULT_PLACE_FILE = '.lab-runtime/sandbox/lab-empty.rbxlx';
const SAVE_SCRIPT = 'scripts/save-sandbox-place.ps1';
const ALLOWED_FLAGS = new Set(['studio', 'place-name', 'place-file', 'revision', 'approver', 'state-dir', 'evidence', 'allow-dirty']);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sha256File(filePath) {
  return sha256(await fs.readFile(filePath));
}

function fail(message, code = 'STUDIO_SANDBOX_PROBE_FAILED') {
  throw Object.assign(new Error(message), { code });
}

function parseFlags(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write([
      'Usage: npm run studio:sandbox -- --studio <id> [--place-name lab-empty.rbxlx] [--place-file <path>] [--revision <commit>] [--approver <label>] [--state-dir <path>] [--evidence <path>] [--allow-dirty]',
      '',
      'This command only operates on the disposable lab-empty.rbxlx sandbox. It creates, replaces, saves, uploads one fixed 1x1 PNG, deletes, and saves the cleanup through single-use approvals.',
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
    fail('Could not determine the full source revision. Pass --revision explicitly.', 'STUDIO_SANDBOX_REVISION_REQUIRED');
  }
}

function extractText(result) {
  return (result?.content ?? []).filter((item) => item?.type === 'text').map((item) => item.text).join('\n').trim();
}

function extractMode(text) {
  return /Current Studio Mode:\s*([A-Za-z]+)/i.exec(text)?.[1] ?? null;
}

function normalizeSource(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\n$/, '');
}

async function readScriptSource(client, studioId) {
  const result = await client.callReadTool('script_read', { target_file: SANDBOX_SCRIPT_PATH, studio_id: studioId });
  if (result?.isError) fail(`Could not read ${SANDBOX_SCRIPT_PATH}: ${extractText(result)}`, 'STUDIO_SANDBOX_SCRIPT_READ_FAILED');
  const text = extractText(result);
  return text.split(/\r?\n/).map((line) => line.replace(/^\s*\d+\s*(?:\u2192|\|)\s?/, '')).join('\n').replace(/\n$/, '');
}

async function probeExists(client, studioId) {
  const result = await client.callReadTool('search_game_tree', {
    studio_id: studioId,
    datamodel_type: 'Edit',
    path: 'ServerScriptService',
    max_depth: 2,
    head_limit: 100,
  });
  if (result?.isError) fail(`Could not inspect ServerScriptService: ${extractText(result)}`, 'STUDIO_SANDBOX_TREE_READ_FAILED');
  return extractText(result).includes('LabSandboxProbe');
}

async function uploadResultText(result) {
  if (result?.isError) fail(`upload_image failed: ${extractText(result)}`, 'STUDIO_SANDBOX_UPLOAD_FAILED');
  const text = extractText(result);
  return { text, assetId: /rbxassetid:\/\/\d+/.exec(text)?.[0] ?? null };
}

async function startProbeImageServer() {
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/lab-upload-probe.png') {
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG.length, 'Cache-Control': 'no-store' });
      response.end(PNG);
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('not found');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/lab-upload-probe.png` };
}

async function readAudit(stateDir) {
  const auditPath = path.join(stateDir, 'audit.jsonl');
  const bytes = await fs.readFile(auditPath);
  const entries = bytes.toString('utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { path: path.relative(ROOT, auditPath).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes), entries };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const studioId = flags.get('studio');
  const placeName = flags.get('place-name') ?? SANDBOX_PLACE_NAME;
  if (placeName !== SANDBOX_PLACE_NAME) fail(`The bounded probe only accepts the disposable ${SANDBOX_PLACE_NAME} place.`);
  const placeFile = path.resolve(ROOT, flags.get('place-file') ?? DEFAULT_PLACE_FILE);
  const sandboxRoot = path.resolve(ROOT, '.lab-runtime', 'sandbox') + path.sep;
  if (!placeFile.startsWith(sandboxRoot) || path.basename(placeFile) !== placeName) {
    fail('The place file must be the disposable .lab-runtime/sandbox/lab-empty.rbxlx file.', 'STUDIO_SANDBOX_PLACE_INVALID');
  }
  const placeStat = await fs.lstat(placeFile).catch(() => null);
  if (!placeStat || placeStat.isSymbolicLink() || !placeStat.isFile()) {
    fail('The disposable place file is missing or is not a regular file.', 'STUDIO_SANDBOX_PLACE_INVALID');
  }
  const revision = flags.get('revision') ?? currentRevision();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(revision)) fail('--revision must be a full Git commit.');
  const approver = flags.get('approver') ?? 'project-owner-mission-20261110';
  if (approver.length > 100) fail('--approver is too long.');
  const evidencePath = flags.get('evidence') ?? DEFAULT_EVIDENCE;
  if (!evidencePath.startsWith('evidence/') || evidencePath.includes('\\') || evidencePath.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('--evidence must be a safe path under evidence/.');
  }
  const sourceIdentity = await captureSourceSnapshot(ROOT);
  if (sourceIdentity.dirty && !flags.get('allow-dirty')) {
    fail('The source tree is dirty. Commit the probe implementation before capturing clean evidence, or pass --allow-dirty for a local rehearsal.', 'STUDIO_SANDBOX_SOURCE_DIRTY');
  }

  const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stateDirRelative = flags.get('state-dir') ?? `${DEFAULT_STATE_ROOT}/${runStamp}`;
  const stateDir = path.resolve(ROOT, stateDirRelative);
  if (!stateDir.startsWith(path.resolve(ROOT, DEFAULT_STATE_ROOT) + path.sep)) {
    fail('The governance state directory must stay under .lab-runtime/studio-governance-sandbox.', 'STUDIO_SANDBOX_STATE_DIR_INVALID');
  }
  await fs.mkdir(stateDir, { recursive: true });
  const governance = new StudioGovernance({ stateDir });
  const client = new StudioMcpClient({ timeoutMs: 30_000 });
  const operations = [];
  const failures = [];
  const uploadAttempts = [];
  const initialHash = await sha256File(placeFile);
  let modeBefore = null;
  let modeAfter = null;
  let liveInstance = null;
  let uploadEvidence = null;
  let cleanup = null;

  async function operation(operationId, parameters, executor) {
    const scope = {
      project: SANDBOX_PROJECT,
      sourceRevision: revision,
      studioId,
      placeName,
      placeId: '0',
      parameters,
    };
    const { token, approval } = await governance.requestApproval({ operationId, scope, approver, ttlMs: 5 * 60_000 });
    const execution = await governance.execute({
      operationId,
      token,
      scope,
      executor: async ({ scope: authorized }) => executor(authorized),
    });
    const record = {
      operationId,
      riskClass: approval.riskClass,
      approvalId: approval.id,
      executionId: execution.executionId,
      parameterDigest: approval.scope.parameterDigest,
      resultDigest: sha256(canonicalJson(execution.result)),
      requestedAt: approval.requestedAt,
      expiresAt: approval.expiresAt,
      result: execution.result,
    };
    operations.push(record);
    return record;
  }

  async function attempt(operationId, parameters, executor) {
    try {
      return { ok: true, record: await operation(operationId, parameters, executor) };
    } catch (error) {
      failures.push({ operationId, code: error?.code ?? 'STUDIO_SANDBOX_OPERATION_FAILED', message: error?.message ?? 'Operation failed.' });
      return { ok: false };
    }
  }

  async function savePlace(parameters) {
    const beforeStat = await fs.stat(placeFile);
    const before = await sha256File(placeFile);
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, SAVE_SCRIPT),
      '-PlaceFile', placeFile, '-PlaceName', placeName,
    ], { cwd: ROOT, encoding: 'utf8', timeout: 60_000, shell: false });
    let parsed = null;
    try { parsed = JSON.parse((result.stdout ?? '').trim().split(/\r?\n/).at(-1)); } catch { /* Recorded below. */ }
    const after = await sha256File(placeFile);
    if (result.status !== 0 || parsed?.status !== 'saved' || after === before) {
      throw Object.assign(new Error(parsed?.message ?? parsed?.code ?? `The local save helper exited ${result.status ?? 'unknown'} without writing the sandbox file.`), {
        code: parsed?.code ?? 'STUDIO_SANDBOX_SAVE_FAILED',
      });
    }
    return {
      executor: SAVE_SCRIPT,
      beforeSha256: before,
      afterSha256: after,
      beforeBytes: beforeStat.size,
      afterBytes: (await fs.stat(placeFile)).size,
      backupPath: parsed.backupPath ? path.relative(ROOT, parsed.backupPath).replaceAll('\\', '/') : null,
      backupSha256: parsed.backupSha256 ?? null,
      windowTitle: parsed.windowTitle,
      processId: parsed.processId,
      changed: parsed.changed,
      ...parameters,
    };
  }

  try {
    await client.connect();
    const status = client.getStatus();
    const instances = await client.listStudios();
    liveInstance = instances.find((entry) => entry.studio_id === studioId);
    if (!liveInstance) fail('The approved sandbox Studio instance is not connected.', 'STUDIO_SANDBOX_INSTANCE_NOT_FOUND');
    if (liveInstance.name !== placeName) fail(`The live instance name does not match ${placeName}. Live name: ${liveInstance.name ?? 'null'}.`, 'STUDIO_SANDBOX_PLACE_MISMATCH');
    if (liveInstance.place_id !== undefined && liveInstance.place_id !== null && String(liveInstance.place_id) !== '0') {
      fail(`The live instance reports a non-local place ID ${liveInstance.place_id}.`, 'STUDIO_SANDBOX_PLACE_MISMATCH');
    }
    const stateBeforeText = extractText(await client.callReadTool('get_studio_state', { studio_id: studioId }));
    modeBefore = extractMode(stateBeforeText);
    if (modeBefore !== 'Edit') fail(`The sandbox must be in Edit mode; it reports ${modeBefore ?? 'unknown'}.`, 'STUDIO_SANDBOX_STATE_MISMATCH');
    if (await probeExists(client, studioId)) fail('The sandbox already contains LabSandboxProbe; refusing to overwrite an unknown probe.', 'STUDIO_SANDBOX_PROBE_PRESENT');

    const create = await attempt('studio.create_sandbox_script', {
      path: SANDBOX_SCRIPT_PATH,
      className: SANDBOX_SCRIPT_CLASS,
      contentSha256: sha256(SANDBOX_PROBE_V1),
    }, async () => {
      const result = await client.callMutationTool('multi_edit', {
        className: SANDBOX_SCRIPT_CLASS,
        datamodel_type: 'Edit',
        edits: [{ old_string: '', new_string: SANDBOX_PROBE_V1 }],
        file_path: SANDBOX_SCRIPT_PATH,
        studio_id: studioId,
      });
      if (result?.isError) fail(`multi_edit create failed: ${extractText(result)}`, 'STUDIO_SANDBOX_CREATE_FAILED');
      const source = await readScriptSource(client, studioId);
      if (source !== normalizeSource(SANDBOX_PROBE_V1)) fail('The created probe source did not read back as the exact V1 source.', 'STUDIO_SANDBOX_CREATE_MISMATCH');
      return { tool: 'multi_edit', action: 'create', sourceSha256: sha256(source), readBack: 'exact_v1' };
    });

    if (create.ok) {
      await attempt('studio.replace_script', {
        path: SANDBOX_SCRIPT_PATH,
        fromSha256: sha256(SANDBOX_PROBE_V1),
        toSha256: sha256(SANDBOX_PROBE_V2),
      }, async () => {
        const result = await client.callMutationTool('multi_edit', {
          datamodel_type: 'Edit',
          edits: [{ old_string: SANDBOX_PROBE_V1, new_string: SANDBOX_PROBE_V2 }],
          file_path: SANDBOX_SCRIPT_PATH,
          studio_id: studioId,
        });
        if (result?.isError) fail(`multi_edit replace failed: ${extractText(result)}`, 'STUDIO_SANDBOX_REPLACE_FAILED');
        const source = await readScriptSource(client, studioId);
        if (source !== normalizeSource(SANDBOX_PROBE_V2)) fail('The replaced probe source did not read back as the exact V2 source.', 'STUDIO_SANDBOX_REPLACE_MISMATCH');
        return { tool: 'multi_edit', action: 'replace', sourceSha256: sha256(source), readBack: 'exact_v2' };
      });

      await attempt('studio.save_place', {
        executor: 'local-keyboard-helper',
        placeFile: path.relative(ROOT, placeFile).replaceAll('\\', '/'),
        beforeSha256: await sha256File(placeFile),
      }, async () => savePlace({ phase: 'save-after-replace', marker: 'LAB_SANDBOX_PROBE_V2' }));
    }

    const uploadImagePath = path.resolve(ROOT, ...SANDBOX_UPLOAD_IMAGE_RELATIVE.split('/'));
    await fs.mkdir(path.dirname(uploadImagePath), { recursive: true });
    await fs.writeFile(uploadImagePath, PNG);
    const uploadHash = await sha256File(uploadImagePath);
    let imageServer = null;
    try {
      imageServer = await startProbeImageServer();
      await attempt('studio.upload_image', {
        imageSha256: uploadHash,
        source: 'loopback-http',
        assetScope: 'account-only',
        usedInPlace: false,
      }, async () => {
        const first = await client.callMutationTool('upload_image', { imagePaths: [imageServer.url], studio_id: studioId });
        uploadAttempts.push({ source: 'loopback-http', url: imageServer.url, result: extractText(first), isError: Boolean(first?.isError) });
        if (!first?.isError) {
          const parsed = await uploadResultText(first);
          uploadEvidence = { source: 'loopback-http', url: imageServer.url, sha256: uploadHash, assetId: parsed.assetId, result: parsed.text, externalAssetCreated: Boolean(parsed.assetId) };
          return uploadEvidence;
        }
        const second = await client.callMutationTool('upload_image', { imagePaths: [uploadImagePath], studio_id: studioId });
        uploadAttempts.push({ source: 'local-path', path: path.relative(ROOT, uploadImagePath).replaceAll('\\', '/'), result: extractText(second), isError: Boolean(second?.isError) });
        const parsed = await uploadResultText(second);
        uploadEvidence = { source: 'local-path', path: path.relative(ROOT, uploadImagePath).replaceAll('\\', '/'), sha256: uploadHash, assetId: parsed.assetId, result: parsed.text, externalAssetCreated: Boolean(parsed.assetId) };
        return uploadEvidence;
      });
    } finally {
      if (imageServer) await new Promise((resolve) => imageServer.server.close(resolve));
    }

    const existsAfterMutation = await probeExists(client, studioId);
    if (existsAfterMutation) {
      const deletion = await attempt('studio.delete_sandbox_script', {
        path: SANDBOX_SCRIPT_PATH,
        expectedMarkers: ['LAB_SANDBOX_PROBE_V1', 'LAB_SANDBOX_PROBE_V2'],
        codeSha256: sha256(SANDBOX_DELETE_CODE),
      }, async () => {
        const result = await client.callMutationTool('execute_luau', {
          code: SANDBOX_DELETE_CODE,
          datamodel_type: 'Edit',
          studio_id: studioId,
        });
        if (result?.isError) fail(`execute_luau delete failed: ${extractText(result)}`, 'STUDIO_SANDBOX_DELETE_FAILED');
        const text = extractText(result);
        if (text !== 'destroyed') fail(`The delete script did not report destroyed; it reported ${text || 'no text'}.`, 'STUDIO_SANDBOX_DELETE_MISMATCH');
        if (await probeExists(client, studioId)) fail('LabSandboxProbe is still present after deletion.', 'STUDIO_SANDBOX_DELETE_MISMATCH');
        return { tool: 'execute_luau', action: 'delete', markerVerified: true, readBack: 'absent', toolResult: text };
      });
      if (deletion.ok) {
        cleanup = await attempt('studio.save_place', {
          executor: 'local-keyboard-helper',
          placeFile: path.relative(ROOT, placeFile).replaceAll('\\', '/'),
          beforeSha256: await sha256File(placeFile),
        }, async () => savePlace({ phase: 'save-after-delete', marker: 'LAB_SANDBOX_PROBE_ABSENT' }));
      }
    } else {
      cleanup = { ok: true, record: null, note: 'The probe was already absent; no delete or cleanup save was required.' };
    }

    modeAfter = extractMode(extractText(await client.callReadTool('get_studio_state', { studio_id: studioId })));
    const audit = await readAudit(stateDir);
    const finalHash = await sha256File(placeFile);
    const finalText = await fs.readFile(placeFile, 'utf8').catch(() => '');
    const markerAbsent = !finalText.includes('LAB_SANDBOX_PROBE_V1') && !finalText.includes('LAB_SANDBOX_PROBE_V2');
    const allPassed = failures.length === 0 && operations.length >= 5 && modeAfter === 'Edit' && markerAbsent;
    const evidence = {
      schemaVersion: 1,
      type: 'verification-run',
      status: allPassed ? 'passed' : 'failed',
      title: 'Bounded Studio sandbox mutation, save, upload, and destructive cleanup',
      capturedAt: new Date().toISOString(),
      project: 'lab',
      scope: 'A disposable Rojo-built local place, lab-empty.rbxlx, was mutated only at game.ServerScriptService.LabSandboxProbe through sealed MCP operations. Each operation used a distinct single-use approval bound to the sandbox Studio instance, place, source revision, and parameter digest. The run exercised create, replace, local save, one fixed 1x1 image upload, destructive delete, and cleanup save. No real project place, publication, or Open Cloud write was touched.',
      sourceIdentity,
      authorization: {
        source: 'user-mission:2026-11-10',
        statement: 'Treat this mission text as the authorization for that authorization/approval scope; record it as such in the governance evidence with explicit in-scope and out-of-scope operations. Keep the path bounded and safe: scope writes to a disposable/test place or sandbox, make destructive operations reversible or backed up, and do not publish, upload to, or destructively mutate any real user project or public experience.',
        inScope: [
          'create, replace, and delete the fixed LabSandboxProbe in the disposable lab-empty.rbxlx place',
          'save the disposable local place with a targeted local helper and a file backup',
          'upload one fixed 1x1 PNG to the account asset inventory without using it in a place',
          'record every approval, audit entry, tool result, and file hash',
        ],
        outOfScope: [
          'publishing any place or experience',
          'uploading or changing any real user project, public experience, or production data',
          'mutating the Signal Garden project place',
          'enabling Open Cloud scopes or writing through Open Cloud',
          'arbitrary Luau, arbitrary script paths, or arbitrary asset uploads',
        ],
      },
      studio: {
        instanceId: studioId,
        name: liveInstance.name,
        placeId: liveInstance.place_id ?? null,
        protocolVersion: status.protocolVersion,
        modeBefore,
        modeAfter,
      },
      sandbox: {
        placeFile: path.relative(ROOT, placeFile).replaceAll('\\', '/'),
        placeName,
        initialSha256: initialHash,
        finalSha256: finalHash,
        finalBytes: (await fs.stat(placeFile)).size,
        fileChanged: initialHash !== finalHash,
        markerAbsentAfterCleanup: markerAbsent,
      },
      operations,
      failures,
      upload: {
        imagePath: SANDBOX_UPLOAD_IMAGE_RELATIVE,
        sha256: uploadHash,
        attempts: uploadAttempts,
        result: uploadEvidence,
        externalAssetCreated: Boolean(uploadEvidence?.externalAssetCreated),
        usedInPlace: false,
      },
      cleanup,
      audit,
      localChecks: {
        command: 'npm run studio:sandbox',
        result: allPassed ? 'passed' : 'failed',
        note: 'This probe records the live Studio operations and their governance audit; npm test and verify:evidence are run separately.',
      },
      capabilityCoverage: [
        { capabilityId: 'LAB-STUDIO-002', acceptanceCriteriaIndexes: [0, 1] },
      ],
      observations: [
        `Studio instance ${studioId} reported ${liveInstance.name} and mode ${modeBefore} before the run and ${modeAfter} after it.`,
        `The sealed probe created V1, replaced it with V2, and deleted it only after the marker check; final markerAbsent=${markerAbsent}.`,
        `The local save helper changed the sandbox file from ${initialHash.slice(0, 12)} to ${finalHash.slice(0, 12)}; a backup was written before each save.`,
        `Upload attempts: ${uploadAttempts.map((entry) => `${entry.source}=${entry.isError ? 'error' : 'returned'}`).join(', ') || 'none'}.`,
        `Approvals and audit entries: ${operations.length} operations, ${audit.entries.length} audit lines.`,
      ],
      limitations: [
        'The save step uses a targeted Windows keyboard helper because Roblox exposes no supported API to save a local .rbxlx file; it requires an interactive desktop and the named Studio window.',
        'The upload creates one external account asset; it is not used in any place and cannot be recalled by the Lab. The asset ID is recorded if Studio returned one.',
        'Publishing was not attempted: the live 36-tool inventory has no publish tool and the mission expressly forbids publishing.',
        'Rojo live sync is a separate probe; this record does not claim it.',
        'No human independent review is attached; the capability remains IN_PROGRESS.',
        'The source identity was dirty=' + sourceIdentity.dirty + '; a dirty capture cannot support a VERIFIED capability.',
      ],
    };
    const fullEvidencePath = path.join(ROOT, evidencePath);
    await fs.mkdir(path.dirname(fullEvidencePath), { recursive: true });
    await fs.writeFile(fullEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      evidence: evidencePath,
      status: evidence.status,
      operations: operations.map((entry) => entry.operationId),
      failures,
      audit: { path: audit.path, bytes: audit.bytes, sha256: audit.sha256, entries: audit.entries.length },
      sandbox: evidence.sandbox,
      upload: evidence.upload,
      cleanup: cleanup?.record ? { operationId: cleanup.record.operationId, result: cleanup.record.result } : cleanup,
    }, null, 2)}\n`);
    if (!allPassed) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: { code: error?.code ?? 'STUDIO_SANDBOX_PROBE_FAILED', message: error?.message ?? 'Sandbox probe failed.' } })}\n`);
  process.exitCode = 1;
});
