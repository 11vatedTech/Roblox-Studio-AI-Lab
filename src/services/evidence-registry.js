import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveWithin } from '../core/path-policy.js';

const REGISTRY_PATH = ['evidence', 'registry.json'];
const MAX_REGISTRY_BYTES = 2 * 1024 * 1024;
const MAX_RECORDS = 100;
const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_REFERENCE_BYTES = 16 * 1024 * 1024;
const RECORD_ID = /^evidence\.[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const TYPES = new Set(['studio-session', 'task-execution', 'verification-run', 'asset-build', 'security-review', 'performance-profile', 'visual-review', 'research']);
const STATUSES = new Set(['passed', 'failed', 'blocked', 'unverified']);
const FIELDS = new Set(['id', 'type', 'status', 'title', 'capturedAt', 'project', 'scope', 'reference', 'referenceSha256', 'limitations']);
const SHA256 = /^[a-f0-9]{64}$/;

function addError(errors, location, code, message) {
  errors.push({ path: location, code, message });
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isText(value, max = 1000) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateEvidenceRegistry(value) {
  const errors = [];
  if (!isObject(value)) return { valid: false, errors: [{ path: '$', code: 'EVIDENCE_REGISTRY_INVALID', message: 'The evidence registry must be an object.' }] };
  if (value.schemaVersion !== 1) addError(errors, 'schemaVersion', 'SCHEMA_VERSION_INVALID', 'schemaVersion must be 1.');
  if (!validDate(value.updatedAt)) addError(errors, 'updatedAt', 'TIMESTAMP_INVALID', 'updatedAt must be a parseable timestamp.');
  if (!Array.isArray(value.records) || value.records.length > MAX_RECORDS) {
    addError(errors, 'records', 'RECORDS_INVALID', `records must be an array with at most ${MAX_RECORDS} entries.`);
    return { valid: false, errors };
  }

  const ids = new Set();
  for (let index = 0; index < value.records.length; index += 1) {
    const record = value.records[index];
    const base = `records[${index}]`;
    if (!isObject(record)) {
      addError(errors, base, 'RECORD_INVALID', 'Each evidence record must be an object.');
      continue;
    }
    for (const key of Object.keys(record)) if (!FIELDS.has(key)) addError(errors, `${base}.${key}`, 'UNKNOWN_FIELD', `The field '${key}' is not part of the evidence registry contract.`);
    if (typeof record.id !== 'string' || !RECORD_ID.test(record.id)) addError(errors, `${base}.id`, 'RECORD_ID_INVALID', 'Evidence IDs must use evidence.<lowercase-kebab-case>.');
    else if (ids.has(record.id)) addError(errors, `${base}.id`, 'DUPLICATE_RECORD_ID', `Evidence ID ${record.id} is duplicated.`);
    else ids.add(record.id);
    if (!TYPES.has(record.type)) addError(errors, `${base}.type`, 'EVIDENCE_TYPE_INVALID', 'Choose a registered evidence type.');
    if (!STATUSES.has(record.status)) addError(errors, `${base}.status`, 'EVIDENCE_STATUS_INVALID', 'Choose passed, failed, blocked, or unverified.');
    if (!isText(record.title, 180)) addError(errors, `${base}.title`, 'TITLE_INVALID', 'A title of at most 180 characters is required.');
    if (!validDate(record.capturedAt)) addError(errors, `${base}.capturedAt`, 'TIMESTAMP_INVALID', 'capturedAt must be a parseable timestamp.');
    if (typeof record.project !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(record.project)) addError(errors, `${base}.project`, 'PROJECT_INVALID', 'project must be a valid local project slug.');
    if (!isText(record.scope, 2000)) addError(errors, `${base}.scope`, 'SCOPE_INVALID', 'A scoped result description of at most 2000 characters is required.');
    if (typeof record.referenceSha256 !== 'string' || !SHA256.test(record.referenceSha256)) addError(errors, `${base}.referenceSha256`, 'REFERENCE_HASH_INVALID', 'referenceSha256 must be a lowercase SHA-256 digest.');
    if (typeof record.reference !== 'string' || !record.reference.startsWith('evidence/') || record.reference.includes('\\') || record.reference.split('/').some((segment) => !segment || segment === '.' || segment === '..' || /^[a-zA-Z]:/.test(segment))) {
      addError(errors, `${base}.reference`, 'REFERENCE_INVALID', 'reference must be a safe evidence-relative file path.');
    }
    if (!Array.isArray(record.limitations) || record.limitations.length > 20 || record.limitations.some((item) => !isText(item, 1000))) {
      addError(errors, `${base}.limitations`, 'LIMITATIONS_INVALID', 'limitations must contain at most 20 short descriptions.');
    }
  }
  return { valid: errors.length === 0, errors };
}

function assertSourceEvidence(record, source) {
  if (!isObject(source) || source.schemaVersion !== 1) throw Object.assign(new Error('The linked source evidence is not a version 1 JSON record.'), { code: 'EVIDENCE_SOURCE_INVALID', status: 500 });
  const sourceProject = source.project ?? source.task?.project;
  if (record.project && sourceProject !== record.project) throw Object.assign(new Error('The linked source evidence belongs to a different project.'), { code: 'EVIDENCE_SOURCE_PROJECT_MISMATCH', status: 500 });
  if (record.type === 'studio-session') {
    const sessions = source.studio?.sessionIds;
    const accepted = source.acceptance;
    const identities = [sessions?.server, sessions?.clientPlayer1, sessions?.clientPlayer2];
    const steps = Array.isArray(source.steps) ? source.steps : [];
    const checks = Array.isArray(accepted?.checks) ? accepted.checks : [];
    const playerTwoInteraction = steps.some((step) => step?.action?.includes('Player2') && step?.result?.includes('Player2'));
    const playerOneInteraction = steps.some((step) => step?.action?.includes('Player1') && step?.result?.includes('Player1'));
    const hasReplicationCheck = checks.some((item) => typeof item === 'string' && /replicated to both clients/i.test(item));
    const hasUnpublishedCloseCheck = checks.some((item) => typeof item === 'string' && /closed without saving or publishing/i.test(item));
    if (!Number.isFinite(source.place?.placeId) || !Number.isFinite(source.place?.gameId) || !isObject(sessions)
      || identities.some((id) => !isText(id, 128)) || new Set(identities).size !== identities.length
      || !isText(source.studio?.mode, 100) || steps.length < 1 || !playerTwoInteraction || !playerOneInteraction
      || !hasReplicationCheck || !hasUnpublishedCloseCheck
      || !isObject(accepted) || accepted.status !== record.status || accepted.scope !== record.scope) {
      throw Object.assign(new Error('The linked Studio record must bind the exact place, three distinct DataModels, both player interactions, replicated counters, no-save closure, and matching scoped acceptance.'), { code: 'EVIDENCE_STUDIO_IDENTITY_INVALID', status: 500 });
    }
  } else if (record.type === 'task-execution') {
    const execution = source.execution;
    if (source.testOnly !== true || source.task?.status !== record.status || !isObject(execution?.processSeparation)
      || (record.status === 'passed' && (execution.outcome !== 'accepted' || execution.processSeparation.differentMcpProcess !== true || execution.processSeparation.differentMcpSession !== true))) {
      throw Object.assign(new Error('The linked task execution record does not satisfy its declared local process-review scope.'), { code: 'EVIDENCE_TASK_EXECUTION_INVALID', status: 500 });
    }
  }
}

async function readReference(root, record) {
  const segments = record.reference.split('/');
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) throw Object.assign(new Error(`Evidence reference does not exist: ${record.reference}.`), { code: 'EVIDENCE_REFERENCE_MISSING', status: 500 });
    if (stat.isSymbolicLink() || (segment === segments.at(-1) ? !stat.isFile() : !stat.isDirectory())) {
      throw Object.assign(new Error(`Evidence reference is not a regular file with a safe path: ${record.reference}.`), { code: 'EVIDENCE_REFERENCE_INVALID', status: 500 });
    }
    if (segment === segments.at(-1) && stat.size > MAX_REFERENCE_BYTES) throw Object.assign(new Error(`Evidence reference exceeds the ${MAX_REFERENCE_BYTES}-byte limit: ${record.reference}.`), { code: 'EVIDENCE_REFERENCE_TOO_LARGE', status: 500 });
  }
  const target = resolveWithin(root, ...segments);
  const bytes = await fs.readFile(target);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== record.referenceSha256) throw Object.assign(new Error(`Evidence reference hash changed: ${record.reference}.`), { code: 'EVIDENCE_REFERENCE_HASH_MISMATCH', status: 500 });
  let source;
  try { source = JSON.parse(bytes.toString('utf8')); }
  catch { throw Object.assign(new Error(`Evidence reference is not valid JSON: ${record.reference}.`), { code: 'EVIDENCE_SOURCE_INVALID', status: 500 }); }
  assertSourceEvidence(record, source);
  return { bytes, source, digest };
}

function summarize(records) {
  const byStatus = Object.fromEntries([...STATUSES].map((status) => [status, records.filter((record) => record.status === status).length]));
  const byType = Object.fromEntries([...TYPES].map((type) => [type, records.filter((record) => record.type === type).length]).filter(([, count]) => count > 0));
  return { total: records.length, passed: byStatus.passed, byStatus, byType };
}

function publicEvidenceDetails(record, source) {
  if (record.type === 'studio-session') {
    return {
      place: { placeId: source.place.placeId, gameId: source.place.gameId, published: source.place.published },
      studio: { mode: source.studio.mode, sessionIds: source.studio.sessionIds },
      playerIdentities: ['Player1', 'Player2'],
      scenario: source.scenario,
      steps: source.steps,
      acceptance: source.acceptance,
    };
  }
  if (record.type === 'task-execution') {
    return {
      task: source.task,
      processSeparation: source.execution.processSeparation,
      outcome: source.execution.outcome,
      outputs: source.execution.outputs,
      fixedChecks: source.execution.fixedChecks,
      verificationRun: source.verificationRun,
    };
  }
  return { project: source.project ?? source.task?.project };
}

export async function loadEvidenceRegistry(rootDir) {
  const root = path.resolve(rootDir);
  const rootStat = await fs.lstat(root).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw Object.assign(new Error('The Lab workspace root is not a real directory.'), { code: 'EVIDENCE_REGISTRY_ROOT_INVALID', status: 500 });
  const registryPath = resolveWithin(root, ...REGISTRY_PATH);
  const stat = await fs.lstat(registryPath).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!stat) throw Object.assign(new Error('The evidence registry is missing.'), { code: 'EVIDENCE_REGISTRY_MISSING', status: 500 });
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_REGISTRY_BYTES) throw Object.assign(new Error('The evidence registry must be a regular JSON file no larger than 2 MiB.'), { code: 'EVIDENCE_REGISTRY_INVALID', status: 500 });
  let value;
  try { value = JSON.parse(await fs.readFile(registryPath, 'utf8')); }
  catch { throw Object.assign(new Error('The evidence registry is not valid JSON.'), { code: 'EVIDENCE_REGISTRY_INVALID', status: 500 }); }
  const validation = validateEvidenceRegistry(value);
  if (!validation.valid) {
    const details = validation.errors.slice(0, 8).map((error) => `${error.path}: ${error.message}`).join(' ');
    throw Object.assign(new Error(`The evidence registry failed validation. ${details}`), { code: 'EVIDENCE_REGISTRY_INVALID', status: 500, details: validation.errors });
  }

  let totalBytes = 0;
  const records = [];
  for (const record of value.records) {
    const { bytes, source, digest } = await readReference(root, record);
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_REFERENCE_BYTES) throw Object.assign(new Error('Evidence references exceed the 16 MiB total read limit.'), { code: 'EVIDENCE_REFERENCE_BUDGET_EXCEEDED', status: 500 });
    records.push({
      ...record,
      referenceIntegrity: { status: 'verified', bytes: bytes.length, sha256: digest },
      validatedDetails: publicEvidenceDetails(record, source),
    });
  }
  records.sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt) || left.id.localeCompare(right.id));
  return { schemaVersion: value.schemaVersion, updatedAt: value.updatedAt, summary: summarize(records), records };
}
