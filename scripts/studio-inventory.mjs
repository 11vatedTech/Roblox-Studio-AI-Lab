#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { StudioMcpClient, defaultStudioLauncherAvailable } from '../src/services/studio-mcp-client.js';
import { captureSourceSnapshot } from './source-snapshot.mjs';

const ROOT = process.cwd();
const DEFAULT_EVIDENCE = 'evidence/studio/lab-live-studio-inventory-20261110-reconciled.json';
const PRIOR_EVIDENCE = 'evidence/studio/lab-live-studio-inventory-20261110.json';
const ALLOWED_FLAGS = new Set(['evidence', 'prior']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return 'null';
}

function fail(message, code = 'STUDIO_INVENTORY_FAILED') {
  throw Object.assign(new Error(message), { code });
}

function parseFlags(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('Usage: npm run studio:inventory -- [--evidence <path>] [--prior <path>]\n');
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

async function readJson(relativePath) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function oldNames(prior) {
  if (!prior) return [];
  if (Array.isArray(prior.tools)) return prior.tools.map((tool) => tool.name).filter(Boolean);
  const callable = Array.isArray(prior.comparison?.callableTools) ? prior.comparison.callableTools : [];
  const blocked = Array.isArray(prior.comparison?.blockedTools)
    ? prior.comparison.blockedTools.map((entry) => (typeof entry === 'string' ? entry : entry?.name)).filter(Boolean)
    : [];
  return [...callable, ...blocked];
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const evidencePath = flags.get('evidence') ?? DEFAULT_EVIDENCE;
  const priorPath = flags.get('prior') ?? PRIOR_EVIDENCE;
  if (!evidencePath.startsWith('evidence/') || evidencePath.includes('\\') || evidencePath.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('--evidence must be a safe path under evidence/.');
  }
  const sourceIdentity = await captureSourceSnapshot(ROOT);
  const prior = await readJson(priorPath);
  const client = new StudioMcpClient({ timeoutMs: 30_000 });
  let payload;
  try {
    await client.connect();
    const status = client.getStatus();
    const inventory = client.getToolInventory();
    const instances = await client.listStudios();
    const tools = inventory.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      descriptionSha256: sha256(tool.description ?? ''),
      inputSchema: tool.inputSchema,
      inputSchemaSha256: tool.inputSchema ? sha256(canonical(tool.inputSchema)) : null,
      inputSchemaStatus: tool.inputSchemaStatus,
      available: tool.available,
      dashboardCallable: tool.dashboardCallable,
      operationClass: tool.operationClass,
      restriction: tool.restriction,
    }));
    const names = tools.map((tool) => tool.name).sort();
    const priorNames = oldNames(prior).sort();
    const added = names.filter((name) => !priorNames.includes(name));
    const removed = priorNames.filter((name) => !names.includes(name));
    const callableTools = tools.filter((tool) => tool.dashboardCallable).map((tool) => tool.name).sort();
    const blockedTools = tools.filter((tool) => !tool.dashboardCallable).map((tool) => ({
      name: tool.name,
      operationClass: tool.operationClass,
      reason: tool.restriction,
    }));
    const schemasMissing = tools.filter((tool) => !tool.inputSchema).length;
    const priorSchemaBodiesRetained = Boolean(prior && (Array.isArray(prior.tools) || prior.comparison?.schemaDigestSha256));
    const schemaDigest = sha256(canonical(tools.map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema }))));
    const inventoryDigest = sha256(canonical(tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      dashboardCallable: tool.dashboardCallable,
    }))));
    const sameNames = added.length === 0 && removed.length === 0;
    const statusValue = inventory.discoveredToolCount === inventory.reportedEntryCount && !inventory.truncated && schemasMissing === 0 ? 'passed' : 'failed';
    payload = {
      schemaVersion: 1,
      type: 'verification-run',
      status: statusValue,
      title: 'Fresh live Studio inventory and schema-baseline reconciliation',
      capturedAt: new Date().toISOString(),
      project: 'lab',
      scope: 'Read-only comparison of the current official Studio MCP tools/list result against the recorded 2026-11-10 inventory. It records names, descriptions, schemas, deterministic digests, callable/blocked labels, and drift. It does not execute any non-inspection tool or mutate a place.',
      sourceIdentity,
      studioConnection: {
        state: status.state,
        protocolEra: status.protocolEra,
        protocolVersion: status.protocolVersion,
        discoveredAt: inventory.discoveredAt,
        launcherInstalled: defaultStudioLauncherAvailable(),
      },
      instances: instances.map((instance) => ({
        studioId: instance.studio_id,
        name: instance.name ?? null,
        placeId: instance.place_id ?? null,
      })),
      comparison: {
        discoveredToolCount: inventory.discoveredToolCount,
        reportedEntryCount: inventory.reportedEntryCount,
        truncated: inventory.truncated,
        callableCount: callableTools.length,
        blockedCount: blockedTools.length,
        schemasMissing,
        callableTools,
        blockedTools,
        schemaDigestSha256: schemaDigest,
        inventoryDigestSha256: inventoryDigest,
        priorEvidence: {
          reference: priorPath,
          capturedAt: prior?.capturedAt ?? null,
          discoveredAt: prior?.studioConnection?.discoveredAt ?? null,
          discoveredToolCount: prior?.comparison?.discoveredToolCount ?? null,
          reportedEntryCount: prior?.comparison?.reportedEntryCount ?? null,
          callableCount: prior?.comparison?.callableCount ?? null,
          blockedCount: prior?.comparison?.blockedCount ?? null,
          schemaBodiesRetained: priorSchemaBodiesRetained,
        },
        drift: {
          toolNamesAdded: added,
          toolNamesRemoved: removed,
          countDelta: inventory.discoveredToolCount - (prior?.comparison?.discoveredToolCount ?? inventory.discoveredToolCount),
          callableDelta: callableTools.length - (prior?.comparison?.callableCount ?? callableTools.length),
          blockedDelta: blockedTools.length - (prior?.comparison?.blockedCount ?? blockedTools.length),
          schemaComparison: priorSchemaBodiesRetained
            ? (prior?.comparison?.schemaDigestSha256 === schemaDigest ? 'identical_digest' : 'digest_changed')
            : 'not_comparable_prior_schema_bodies_absent',
          namesMatch: sameNames,
        },
      },
      tools,
      observations: [
        `The live Studio server reported ${inventory.discoveredToolCount} tools and the Lab reported ${inventory.reportedEntryCount} entries; truncated=${inventory.truncated}.`,
        `Exactly ${callableTools.length} tools are dashboard-callable and ${blockedTools.length} remain blocked.`,
        `${schemasMissing} tool schemas were missing; ${tools.length} schema bodies were retained in this record.`,
        `Tool-name drift against ${priorPath}: added=${added.length}, removed=${removed.length}.`,
        priorSchemaBodiesRetained
          ? 'The prior record retained schema material, so a schema digest comparison was possible.'
          : 'The prior record did not retain schema bodies or a schema digest, so no schema-level drift claim is possible; this record establishes the first exact schema baseline.',
      ],
      limitations: [
        'This is a read-only inventory capture; it does not exercise mutation, save, upload, publishing, or Rojo sync.',
        'The prior 2026-11-10 record did not retain tool schemas, so only names, counts, and callable/blocked labels can be diffed; schema drift begins with this baseline.',
        'The capture covers the current Studio build and the connected local instances only; a Studio upgrade can change the list.',
        `Source identity was dirty=${sourceIdentity.dirty}; a dirty capture cannot support a VERIFIED capability.`,
      ],
    };
  } finally {
    await client.close();
  }

  const fullPath = path.join(ROOT, evidencePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'w' });
  process.stdout.write(`${JSON.stringify({
    evidence: evidencePath,
    status: payload.status,
    discoveredToolCount: payload.comparison.discoveredToolCount,
    callableCount: payload.comparison.callableCount,
    blockedCount: payload.comparison.blockedCount,
    schemasMissing: payload.comparison.schemasMissing,
    added: payload.comparison.drift.toolNamesAdded,
    removed: payload.comparison.drift.toolNamesRemoved,
    schemaComparison: payload.comparison.drift.schemaComparison,
    sourceIdentity,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: { code: error?.code ?? 'STUDIO_INVENTORY_FAILED', message: error?.message ?? 'Studio inventory failed.' } })}\n`);
  process.exitCode = 1;
});
