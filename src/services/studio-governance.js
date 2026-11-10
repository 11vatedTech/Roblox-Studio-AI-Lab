import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const GOVERNANCE_SCHEMA_VERSION = 1;
export const STUDIO_RISK_CLASSES = Object.freeze([
  Object.freeze({ id: 'inspection', rank: 0, approvalRequired: false, description: 'Read-only inspection that cannot change the DataModel, assets, or published state.' }),
  Object.freeze({ id: 'reversible_mutation', rank: 1, approvalRequired: true, description: 'Changes runtime or DataModel state that can be undone without losing user content.' }),
  Object.freeze({ id: 'destructive_mutation', rank: 2, approvalRequired: true, description: 'Overwrites, replaces, or deletes user content where rollback is not guaranteed.' }),
  Object.freeze({ id: 'upload', rank: 3, approvalRequired: true, description: 'Creates an external asset or inventory item, including any upload that cannot be recalled locally.' }),
  Object.freeze({ id: 'publishing', rank: 4, approvalRequired: true, description: 'Publishes, releases, or changes a live experience, place, or production setting.' }),
]);

function operation(id, riskClass, tool, description) {
  const risk = STUDIO_RISK_CLASSES.find((entry) => entry.id === riskClass);
  if (!risk) throw new Error(`Unknown risk class ${riskClass}.`);
  return Object.freeze({
    id,
    riskClass,
    tool,
    description,
    approvalRequired: risk.approvalRequired,
    labExposed: riskClass === 'inspection',
  });
}

// This catalog is closed on purpose. A tool that the Studio server reports but that
// is absent here stays unclassified and cannot pass through the gate. The dashboard
// wires executors only for the inspection entries; no mutation route exists.
export const STUDIO_OPERATION_CATALOG = Object.freeze([
  operation('studio.list_instances', 'inspection', 'list_roblox_studios', 'List the Studio instances connected to the local MCP server.'),
  operation('studio.read_state', 'inspection', 'get_studio_state', 'Read the current Studio mode and available DataModels.'),
  operation('studio.read_console', 'inspection', 'get_console_output', 'Read the Studio output console.'),
  operation('studio.search_tree', 'inspection', 'search_game_tree', 'Search the DataModel hierarchy.'),
  operation('studio.inspect_instance', 'inspection', 'inspect_instance', 'Read one instance and its properties.'),
  operation('studio.read_script', 'inspection', 'script_read', 'Read a script source.'),
  operation('studio.capture_viewport', 'inspection', 'screen_capture', 'Capture the local Studio viewport for review.'),
  operation('studio.start_playtest', 'reversible_mutation', 'start_stop_play', 'Start a local play session through the fixed CLI after a single-use approval; no save.'),
  operation('studio.stop_playtest', 'reversible_mutation', 'start_stop_play', 'Stop a local play session through the fixed CLI after a single-use approval; no save.'),
  operation('studio.sync_project', 'reversible_mutation', null, 'Apply declared project source to a bound Studio place through an approved sync workflow.'),
  operation('studio.save_place', 'destructive_mutation', null, 'Save or overwrite the open place file.'),
  operation('studio.replace_script', 'destructive_mutation', 'multi_edit', 'Replace existing script source in the open place.'),
  operation('studio.upload_image', 'upload', 'upload_image', 'Upload an image so Studio can reference it.'),
  operation('studio.upload_asset', 'upload', null, 'Upload a mesh, texture, animation, or model to an asset inventory.'),
  operation('studio.publish_place', 'publishing', null, 'Publish the place or experience to players.'),
]);

const APPROVAL_SCHEMA_VERSION = 1;
const DEFAULT_TTL_MS = 10 * 60_000;
const MIN_TTL_MS = 15_000;
const MAX_TTL_MS = 60 * 60_000;
const MAX_APPROVALS = 500;
const MAX_AUDIT_LINES = 2_000;
const MAX_AUDIT_BYTES = 2 * 1024 * 1024;
const MAX_SCOPE_CHARS = 64 * 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function fail(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function canonicalJson(value, depth = 0) {
  if (depth > 20) throw fail('STUDIO_APPROVAL_SCOPE_INVALID', 'Approval parameters are nested too deeply.');
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw fail('STUDIO_APPROVAL_SCOPE_INVALID', 'Approval parameters must contain finite numbers.');
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry, depth + 1)).join(',')}]`;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw fail('STUDIO_APPROVAL_SCOPE_INVALID', 'Approval parameters must be plain JSON objects.');
    }
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`).join(',')}}`;
  }
  throw fail('STUDIO_APPROVAL_SCOPE_INVALID', 'Approval parameters must be serializable JSON values.');
}

function requireText(value, field, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw fail('STUDIO_APPROVAL_SCOPE_INVALID', `${field} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function normalizeRevision(value) {
  const revision = typeof value === 'number' ? String(value) : value;
  if (typeof revision !== 'string' || !revision.trim() || revision.length > 100) {
    throw fail('STUDIO_APPROVAL_SCOPE_INVALID', 'sourceRevision must identify the exact source revision.');
  }
  if (/^\d+$/.test(revision) && Number(revision) < 1) {
    throw fail('STUDIO_APPROVAL_SCOPE_INVALID', 'sourceRevision must be a positive revision number or a source identity string.');
  }
  return revision.trim();
}

function normalizeScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    throw fail('STUDIO_APPROVAL_SCOPE_INVALID', 'An approval scope must bind project, source revision, Studio instance, and place.');
  }
  const parameters = scope.parameters ?? {};
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw fail('STUDIO_APPROVAL_SCOPE_INVALID', 'Approval parameters must be a JSON object.');
  }
  const parameterText = canonicalJson(parameters);
  if (Buffer.byteLength(parameterText, 'utf8') > MAX_SCOPE_CHARS) {
    throw fail('STUDIO_APPROVAL_SCOPE_INVALID', 'Approval parameters exceed the 64 KiB limit.');
  }
  const normalized = {
    project: requireText(scope.project, 'project', 100),
    sourceRevision: normalizeRevision(scope.sourceRevision),
    studioId: requireText(scope.studioId, 'studioId', 100),
    placeName: requireText(scope.placeName, 'placeName', 200),
    placeId: scope.placeId === undefined || scope.placeId === null ? null : requireText(String(scope.placeId), 'placeId', 100),
    parameters: JSON.parse(parameterText),
    parameterDigest: sha256(parameterText),
  };
  normalized.fingerprint = sha256(canonicalJson({
    project: normalized.project,
    sourceRevision: normalized.sourceRevision,
    studioId: normalized.studioId,
    placeName: normalized.placeName,
    placeId: normalized.placeId,
    parameterDigest: normalized.parameterDigest,
  }));
  return normalized;
}

function publicScope(scope) {
  return {
    project: scope.project,
    sourceRevision: scope.sourceRevision,
    studioId: scope.studioId,
    placeName: scope.placeName,
    placeId: scope.placeId,
    parameterDigest: scope.parameterDigest,
  };
}

function publicApproval(record) {
  return {
    id: record.id,
    operationId: record.operationId,
    riskClass: record.riskClass,
    approver: record.approver,
    requestedAt: record.requestedAt,
    expiresAt: record.expiresAt,
    usedAt: record.usedAt,      scope: publicScope(record.scope),
    };
  }

function describeOperation(entry) {
  return {
    id: entry.id,
    riskClass: entry.riskClass,
    tool: entry.tool,
    approvalRequired: entry.approvalRequired,
    labExposed: entry.labExposed,
    description: entry.description,
  };
}

export class StudioGovernance {
  #queue = Promise.resolve();

  constructor({ stateDir, now = () => new Date(), defaultTtlMs = DEFAULT_TTL_MS } = {}) {
    if (typeof stateDir !== 'string' || !stateDir.trim()) {
      throw new TypeError('StudioGovernance requires a stateDir.');
    }
    if (!Number.isInteger(defaultTtlMs) || defaultTtlMs < MIN_TTL_MS || defaultTtlMs > MAX_TTL_MS) {
      throw new RangeError(`defaultTtlMs must be between ${MIN_TTL_MS} and ${MAX_TTL_MS}.`);
    }
    this.stateDir = path.resolve(stateDir);
    this.approvalsPath = path.join(this.stateDir, 'approvals.json');
    this.auditPath = path.join(this.stateDir, 'audit.jsonl');
    this.now = now;
    this.defaultTtlMs = defaultTtlMs;
  }

  getMatrix() {
    return {
      schemaVersion: GOVERNANCE_SCHEMA_VERSION,
      riskClasses: STUDIO_RISK_CLASSES.map((entry) => ({ ...entry })),
      operations: STUDIO_OPERATION_CATALOG.map(describeOperation),
      policy: {
        approvals: 'A high-impact operation requires a single-use token bound to the operation, project, source revision, Studio instance, place, and a digest of its parameters.',
        ttlMs: { min: MIN_TTL_MS, max: MAX_TTL_MS, default: this.defaultTtlMs },
        audit: 'Approval issuance, authorization, execution start, result, and denial are appended to a local audit log without storing the token.',
        dashboard: 'The dashboard is read-only. The fixed local CLI is the only registered executor, and it supports only start/stop playtest; no mutation HTTP route exists.',
      },
    };
  }

  #operation(operationId) {
    if (typeof operationId !== 'string' || !operationId) {
      throw fail('STUDIO_OPERATION_UNKNOWN', 'The Studio operation is not in the Lab operation catalog.');
    }
    const entry = STUDIO_OPERATION_CATALOG.find((candidate) => candidate.id === operationId);
    if (!entry) throw fail('STUDIO_OPERATION_UNKNOWN', 'The Studio operation is not in the Lab operation catalog.');
    return entry;
  }

  async #withLock(run) {
    const previous = this.#queue;
    let release;
    this.#queue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await run();
    } finally {
      release();
    }
  }

  async #loadApprovals() {
    let text;
    try {
      text = await fs.readFile(this.approvalsPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw fail('STUDIO_GOVERNANCE_STATE_INVALID', 'The approval store is not valid JSON; approvals are blocked until it is repaired.', 500);
    }
    if (!parsed || parsed.schemaVersion !== APPROVAL_SCHEMA_VERSION || !Array.isArray(parsed.approvals)) {
      throw fail('STUDIO_GOVERNANCE_STATE_INVALID', 'The approval store has an unsupported shape; approvals are blocked.', 500);
    }
    for (const record of parsed.approvals) {
      if (!record || typeof record !== 'object'
        || typeof record.id !== 'string'
        || typeof record.tokenSha256 !== 'string'
        || typeof record.operationId !== 'string'
        || typeof record.riskClass !== 'string'
        || !record.scope || typeof record.scope.fingerprint !== 'string'
        || typeof record.requestedAt !== 'string'
        || typeof record.expiresAt !== 'string') {
        throw fail('STUDIO_GOVERNANCE_STATE_INVALID', 'The approval store contains an invalid record; approvals are blocked.', 500);
      }
    }
    return parsed.approvals;
  }

  async #saveApprovals(records) {
    await fs.mkdir(this.stateDir, { recursive: true });
    const bounded = records
      .slice()
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
      .slice(-MAX_APPROVALS);
    const payload = { schemaVersion: APPROVAL_SCHEMA_VERSION, approvals: bounded };
    const tempPath = path.join(this.stateDir, `.approvals.${randomUUID()}.tmp`);
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      await fs.rename(tempPath, this.approvalsPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  async requestApproval({ operationId, scope, approver, ttlMs } = {}) {
    const entry = this.#operation(operationId);
    if (!entry.approvalRequired) {
      throw fail('STUDIO_APPROVAL_NOT_REQUIRED', `${entry.id} is an inspection and does not take an approval token.`);
    }
    const normalized = normalizeScope(scope);
    const approverName = requireText(approver, 'approver', 100);
    const ttl = ttlMs === undefined ? this.defaultTtlMs : ttlMs;
    if (!Number.isInteger(ttl) || ttl < MIN_TTL_MS || ttl > MAX_TTL_MS) {
      throw fail('STUDIO_APPROVAL_TTL_INVALID', `Approval lifetime must be an integer from ${MIN_TTL_MS} to ${MAX_TTL_MS} milliseconds.`);
    }
    const token = randomBytes(32).toString('base64url');
    const requestedAt = this.now();
    const record = {
      id: randomUUID(),
      operationId: entry.id,
      riskClass: entry.riskClass,
      tokenSha256: sha256(token),
      approver: approverName,
      requestedAt: requestedAt.toISOString(),
      expiresAt: new Date(requestedAt.getTime() + ttl).toISOString(),
      usedAt: null,
      scope: { ...publicScope(normalized), fingerprint: normalized.fingerprint },
    };
    await this.#withLock(async () => {
      const records = await this.#loadApprovals();
      records.push(record);
      await this.#saveApprovals(records);
    });
    await this.#auditSafe({
      decision: 'approval_issued',
      reasonCode: 'AWAITING_EXECUTION',
      operationId: entry.id,
      riskClass: entry.riskClass,
      approvalId: record.id,
      approver: record.approver,
      scope: record.scope,
      durationMs: 0,
      detail: `Approval expires at ${record.expiresAt}.`,
    });
    return { token, approval: publicApproval(record) };
  }

  async authorize({ token, operationId, scope } = {}) {
    const entry = this.#operation(operationId);
    if (!entry.approvalRequired) {
      throw fail('STUDIO_APPROVAL_NOT_REQUIRED', `${entry.id} is an inspection and does not take an approval token.`);
    }
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      throw fail('STUDIO_APPROVAL_NOT_FOUND', 'A valid single-use approval token is required for this operation.', 403);
    }
    const normalized = normalizeScope(scope);
    const tokenSha256 = sha256(token);
    return await this.#withLock(async () => {
      const records = await this.#loadApprovals();
      const record = records.find((candidate) => candidate.tokenSha256 === tokenSha256);
      if (!record || record.operationId !== entry.id) {
        throw fail('STUDIO_APPROVAL_NOT_FOUND', 'No approval token matches this operation.', 403);
      }
      if (record.usedAt) {
        throw fail('STUDIO_APPROVAL_REPLAYED', 'This approval token has already been used.', 409);
      }
      if (Date.parse(record.expiresAt) <= this.now().getTime()) {
        throw fail('STUDIO_APPROVAL_EXPIRED', 'This approval token has expired.', 410);
      }
      if (record.scope.fingerprint !== normalized.fingerprint) {
        throw fail('STUDIO_APPROVAL_SCOPE_MISMATCH', 'The approval does not match this project, source revision, Studio instance, place, or parameter set.', 403);
      }
      record.usedAt = this.now().toISOString();
      await this.#saveApprovals(records);
      return publicApproval(record);
    });
  }

  async execute({ operationId, token, scope, executor } = {}) {
    const entry = this.#operation(operationId);
    if (typeof executor !== 'function') {
      throw fail('STUDIO_EXECUTOR_REQUIRED', 'The Lab has no executor registered for this Studio operation.', 409);
    }
    const normalized = normalizeScope(scope);
    const executionId = randomUUID();
    const startedAt = Date.now();
    const base = {
      executionId,
      operationId: entry.id,
      riskClass: entry.riskClass,
      scope: publicScope(normalized),
    };
    let approval = null;
    if (entry.approvalRequired) {
      try {
        approval = await this.authorize({ token, operationId: entry.id, scope: normalized });
      } catch (error) {
        await this.#auditSafe({
          ...base,
          decision: 'denied',
          reasonCode: error.code ?? 'STUDIO_APPROVAL_INVALID',
          detail: error.message,
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
      try {
        await this.#appendAudit({
          ...base,
          decision: 'started',
          reasonCode: 'APPROVED',
          approvalId: approval.id,
          approver: approval.approver,
          durationMs: 0,
        });
      } catch {
        throw fail('STUDIO_AUDIT_WRITE_FAILED', 'The operation was not started because its audit record could not be written.', 500);
      }
    }
    try {
      const result = await executor({ operation: describeOperation(entry), scope: normalized });
      let resultDigest = null;
      try { resultDigest = sha256(canonicalJson(result ?? null)); } catch { resultDigest = null; }
      await this.#appendAudit({
        ...base,
        decision: 'succeeded',
        reasonCode: 'OK',
        approvalId: approval?.id ?? null,
        approver: approval?.approver ?? null,
        durationMs: Date.now() - startedAt,
        resultDigest,
      });
      return { executionId, result, approval };
    } catch (error) {
      await this.#auditSafe({
        ...base,
        decision: 'failed',
        reasonCode: typeof error?.code === 'string' ? error.code : 'STUDIO_OPERATION_FAILED',
        detail: typeof error?.message === 'string' ? error.message.slice(0, 300) : 'The operation failed.',
        approvalId: approval?.id ?? null,
        approver: approval?.approver ?? null,
        durationMs: Date.now() - startedAt,
      });
      throw fail('STUDIO_OPERATION_FAILED', 'The Studio operation failed after authorization; review the audit record.', 502);
    }
  }

  async #appendAudit(record) {
    await fs.mkdir(this.stateDir, { recursive: true });
    const entry = {
      schemaVersion: GOVERNANCE_SCHEMA_VERSION,
      id: randomUUID(),
      at: this.now().toISOString(),
      ...record,
    };
    await fs.appendFile(this.auditPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
    const stat = await fs.stat(this.auditPath).catch(() => null);
    if (stat && stat.size > MAX_AUDIT_BYTES) await this.#compactAudit();
  }

  async #auditSafe(record) {
    try {
      await this.#appendAudit(record);
    } catch {
      // A denial still stands even when the local audit file is unavailable.
    }
  }

  async #compactAudit() {
    const text = await fs.readFile(this.auditPath, 'utf8').catch(() => '');
    const lines = text.split('\n').filter(Boolean).slice(-MAX_AUDIT_LINES);
    const tempPath = path.join(this.stateDir, `.audit.${randomUUID()}.tmp`);
    await fs.writeFile(tempPath, `${lines.join('\n')}${lines.length ? '\n' : ''}`, { flag: 'wx', mode: 0o600 });
    await fs.rename(tempPath, this.auditPath);
  }

  async listAudit(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw fail('STUDIO_AUDIT_LIMIT_INVALID', 'Audit limit must be an integer from 1 to 200.');
    }
    let text;
    try {
      text = await fs.readFile(this.auditPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const records = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === 'object' && typeof parsed.operationId === 'string' && typeof parsed.decision === 'string') records.push(parsed);
      } catch {
        // Skip a torn line rather than hiding the rest of the audit trail.
      }
    }
    return records.slice(-limit).reverse();
  }
}

export function describeStudioGovernanceState(stateDir) {
  return { stateDir: path.resolve(stateDir), approvals: 'approvals.json', audit: 'audit.jsonl' };
}
