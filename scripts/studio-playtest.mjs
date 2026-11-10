#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { StudioMcpClient } from '../src/services/studio-mcp-client.js';
import { StudioGovernance } from '../src/services/studio-governance.js';

const OPERATIONS = Object.freeze({
  start: Object.freeze({ id: 'studio.start_playtest', isStart: true, expectedMode: 'Play', oppositeMode: 'Edit' }),
  stop: Object.freeze({ id: 'studio.stop_playtest', isStart: false, expectedMode: 'Edit', oppositeMode: 'Play' }),
});
const ALLOWED_FLAGS = new Set(['action', 'project', 'studio', 'place-name', 'place-id', 'revision', 'approver']);

function fail(message, code = 'STUDIO_PLAYTEST_INVALID') {
  throw Object.assign(new Error(message), { code });
}

function usage() {
  return [
    'Usage:',
    '  npm run studio:playtest -- --action start|stop --project <slug> --studio <id> --place-name <file.rbxlx> [--place-id 0] [--revision <commit>] [--approver <id>]',
    '',
    'This command can only start or stop a local Studio playtest. It cannot save,',
    'upload, publish, replace a script, execute Luau, or call another Studio tool.',
  ].join('\n');
}

function parseFlags(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) fail(`Unexpected argument: ${raw}`);
    const key = raw.slice(2);
    if (!ALLOWED_FLAGS.has(key)) fail(`Unknown option: --${key}`);
    if (flags.has(key)) fail(`Option --${key} was supplied more than once.`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`Option --${key} requires a value.`);
    flags.set(key, value);
    index += 1;
  }
  for (const key of ['action', 'project', 'studio', 'place-name']) {
    if (!flags.has(key)) fail(`Missing required option --${key}.`);
  }
  return flags;
}

function currentRevision() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0 || !/^[a-f0-9]{40,64}$/i.test(result.stdout.trim())) {
    fail('Could not determine the full source revision. Pass --revision explicitly.', 'STUDIO_PLAYTEST_REVISION_REQUIRED');
  }
  return result.stdout.trim();
}

function extractText(result) {
  const blocks = (result?.content ?? []).filter((item) => item?.type === 'text').map((item) => item.text);
  return blocks.join('\n').trim();
}

function extractMode(text) {
  const match = /Current Studio Mode:\s*([A-Za-z]+)/i.exec(text);
  return match ? match[1] : null;
}

async function waitForMode(client, studioId, expectedMode, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  while (Date.now() <= deadline) {
    const result = await client.callReadTool('get_studio_state', { studio_id: studioId });
    lastText = extractText(result);
    if (extractMode(lastText) === expectedMode) return lastText;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail(`Studio did not report ${expectedMode} within ${timeoutMs} ms. Last state: ${lastText || 'no text'}`, 'STUDIO_PLAYTEST_STATE_MISMATCH');
}

function summarizeResult(result) {
  const text = extractText(result);
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const action = flags.get('action');
  const operation = OPERATIONS[action];
  if (!operation) fail('--action must be start or stop.');

  const project = flags.get('project');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(project || '')) fail('--project must be a valid local project slug.');
  const projectRoot = path.join(process.cwd(), 'projects', project);
  const projectStat = await fs.lstat(projectRoot).catch((error) => {
    if (error.code === 'ENOENT') fail(`Project ${project} does not exist in projects/.`, 'STUDIO_PLAYTEST_PROJECT_NOT_FOUND');
    throw error;
  });
  if (projectStat.isSymbolicLink() || !projectStat.isDirectory()) {
    fail('The selected project must be a real directory inside projects/.', 'STUDIO_PLAYTEST_PROJECT_INVALID');
  }

  const studioId = flags.get('studio');
  const placeName = flags.get('place-name');
  const placeId = flags.get('place-id') ?? '0';
  const sourceRevision = flags.get('revision') ?? currentRevision();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sourceRevision)) fail('--revision must be a full Git commit.');
  if (placeId.length > 100) fail('--place-id is too long.');
  const approver = flags.get('approver') ?? 'project-owner-mission-20261110';
  if (approver.length > 100) fail('--approver is too long.');

  const client = new StudioMcpClient({ timeoutMs: 30_000 });
  try {
    await client.connect();
    const instances = await client.listStudios();
    const instance = instances.find((entry) => entry.studio_id === studioId);
    if (!instance) fail('That Studio instance is not connected.', 'STUDIO_PLAYTEST_INSTANCE_NOT_FOUND');
    if (instance.name !== placeName) {
      fail(`The live instance name does not match --place-name. Live name: ${instance.name ?? 'null'}.`, 'STUDIO_PLAYTEST_PLACE_MISMATCH');
    }
    if (instance.place_id !== undefined && instance.place_id !== null && String(instance.place_id) !== placeId) {
      fail(`The live place ID does not match --place-id. Live place ID: ${instance.place_id}.`, 'STUDIO_PLAYTEST_PLACE_MISMATCH');
    }

    const stateBefore = extractText(await client.callReadTool('get_studio_state', { studio_id: studioId }));
    const modeBefore = extractMode(stateBefore);
    if (modeBefore !== operation.oppositeMode) {
      fail(`Expected Studio to be in ${operation.oppositeMode} before ${action}; it reports ${modeBefore ?? 'an unknown mode'}.`, 'STUDIO_PLAYTEST_STATE_MISMATCH');
    }

    const scope = {
      project,
      sourceRevision,
      studioId,
      placeName,
      placeId,
      parameters: { is_start: operation.isStart },
    };
    const governance = new StudioGovernance({
      stateDir: path.join(process.cwd(), '.lab-runtime', 'studio-governance'),
    });
    const { token, approval } = await governance.requestApproval({
      operationId: operation.id,
      scope,
      approver,
      ttlMs: 5 * 60_000,
    });

    const execution = await governance.execute({
      operationId: operation.id,
      token,
      scope,
      executor: async ({ scope: authorized }) => {
        const result = await client.callMutationTool('start_stop_play', {
          studio_id: authorized.studioId,
          is_start: operation.isStart,
        });
        if (result?.isError) throw Object.assign(new Error('Studio refused start_stop_play.'), { code: 'STUDIO_PLAYTEST_TOOL_ERROR' });
        return {
          tool: 'start_stop_play',
          is_start: operation.isStart,
          studio_id: authorized.studioId,
          result: summarizeResult(result),
        };
      },
    });

    const stateAfter = await waitForMode(client, studioId, operation.expectedMode);
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      action,
      operationId: operation.id,
      scope,
      liveInstance: { studioId: instance.studio_id, name: instance.name, placeId: instance.place_id ?? null },
      sourceRevision,
      before: { mode: modeBefore, state: stateBefore },
      approval,
      execution: { executionId: execution.executionId, result: execution.result },
      after: { mode: operation.expectedMode, state: stateAfter },
      auditPath: path.join('.lab-runtime', 'studio-governance', 'audit.jsonl'),
    }, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: { code: error?.code ?? 'STUDIO_PLAYTEST_FAILED', message: error?.message ?? 'Studio playtest failed.' } })}\n`);
  process.exitCode = 1;
});
