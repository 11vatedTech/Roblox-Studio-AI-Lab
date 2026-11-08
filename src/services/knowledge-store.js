import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { validateKnowledgeRecord } from '../core/knowledge-record.js';

const RECORD_DIRECTORY_SEGMENTS = ['docs', 'game-intelligence', 'records'];
const KNOWLEDGE_KINDS = new Set([
  'engine-capability',
  'game-family',
  'mechanic',
  'visual-style',
  'animation-domain',
  'product-pattern',
  'production-pattern',
  'failure-pattern',
]);
const PLATFORM_STATES = new Set(['released', 'beta', 'experimental', 'announced', 'delayed', 'deprecated', 'unknown', 'not-applicable']);
const MATURITY_LEVELS = new Set(['L1', 'L2', 'L3', 'L4']);
const KNOWLEDGE_ID_PATTERN = /^[a-z][a-z0-9-]{0,47}\.[a-z0-9][a-z0-9-]{0,95}$/;
const MAX_DIRECTORY_DEPTH = 4;
const MAX_DISCOVERED_ENTRIES = 2_000;
const MAX_RECORD_FILES = 512;
const MAX_RECORD_FILE_BYTES = 64 * 1024;
const MAX_TOTAL_RECORD_BYTES = 16 * 1024 * 1024;
const MAX_RETURNED_DIAGNOSTICS = 50;
const MAX_VALIDATION_ERRORS_PER_RECORD = 50;
const MAX_QUERY_LENGTH = 200;
const MAX_FILTER_IDS = 20;

function fail(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function diagnostic(code, relativePath, message, extra = {}) {
  return {
    code,
    path: relativePath,
    message: String(message).slice(0, 300),
    ...extra,
  };
}

function relativePath(segments) {
  return segments.join('/');
}

function comparableFilesystemPath(value) {
  let resolved = path.resolve(value);
  if (process.platform !== 'win32') return resolved;
  const namespacePrefix = String.raw\`\\\\?\\\`;
  if (resolved.startsWith(namespacePrefix)) resolved = resolved.slice(namespacePrefix.length);
  return resolved.replaceAll('/', '\\\\').toLowerCase();
}

function relativeFilesystemPath(root, target) {
  return path.relative(comparableFilesystemPath(root), comparableFilesystemPath(target));
}


function ensureSingleComponent(name) {
  return typeof name === 'string'
    && name.length > 0
    && name !== '.'
    && name !== '..'
    && !name.includes('/')
    && !name.includes('\\')
    && !name.includes('\0');
}

async function recordsDirectory(rootDir) {
  if (typeof rootDir !== 'string' || rootDir.trim() === '' || rootDir.includes('\0')) {
    throw fail('KNOWLEDGE_ROOT_INVALID', 'A repository root directory is required.');
  }

  const resolvedRoot = path.resolve(rootDir);
  let rootStat;
  try {
    rootStat = await fs.lstat(resolvedRoot);
  } catch (error) {
    if (error.code === 'ENOENT') return { directory: null, missing: true };
    throw error;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw fail('KNOWLEDGE_PATH_INVALID', 'The repository root must be a real local directory.');
  }

  let current = resolvedRoot;
  for (const [index, segment] of RECORD_DIRECTORY_SEGMENTS.entries()) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') return { directory: null, missing: true };
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      const boundary = RECORD_DIRECTORY_SEGMENTS.slice(0, index + 1).join('/');
      throw fail('KNOWLEDGE_PATH_INVALID', `The ${boundary} knowledge path must contain only real directories.`);
    }
  }

  return { directory: current, missing: false };
}

function sameFile(left, right) {
  if (left.dev !== right.dev) return false;
  if (left.ino !== 0 && right.ino !== 0) return left.ino === right.ino;
  return left.size === right.size && left.mtimeMs === right.mtimeMs && left.birthtimeMs === right.birthtimeMs;
}

async function readBoundedUtf8File(filePath, relative, expectedRoot, initialStat) {
  let handle;
  try {
    const noFollow = process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0);
    handle = await fs.open(filePath, constants.O_RDONLY | noFollow);
    const openedStat = await handle.stat();
    const pathStat = await fs.lstat(filePath);
    const realPath = await fs.realpath(filePath);
    const insideRoot = relativeFilesystemPath(expectedRoot, realPath);
    if (pathStat.isSymbolicLink() || !pathStat.isFile() || !openedStat.isFile()
      || !sameFile(initialStat, openedStat) || !sameFile(pathStat, openedStat)
      || insideRoot === '..' || insideRoot.startsWith(`..${path.sep}`) || path.isAbsolute(insideRoot)) {
      return { error: diagnostic('SYMLINK_REJECTED', relative, 'The record path changed or resolves outside the records directory.') };
    }
    if (openedStat.size > MAX_RECORD_FILE_BYTES) {
      return { error: diagnostic('RECORD_TOO_LARGE', relative, `Record exceeds the ${MAX_RECORD_FILE_BYTES} byte limit.`) };
    }

    const chunks = [];
    const buffer = Buffer.alloc(Math.min(64 * 1024, MAX_RECORD_FILE_BYTES + 1));
    let length = 0;
    while (length <= MAX_RECORD_FILE_BYTES) {
      const remaining = MAX_RECORD_FILE_BYTES + 1 - length;
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, remaining), length);
      if (bytesRead === 0) break;
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      length += bytesRead;
      if (length > MAX_RECORD_FILE_BYTES) {
        return { error: diagnostic('RECORD_TOO_LARGE', relative, `Record exceeds the ${MAX_RECORD_FILE_BYTES} byte limit.`) };
      }
    }

    const bytes = Buffer.concat(chunks, length);
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return { error: diagnostic('INVALID_UTF8', relative, 'Record files must contain valid UTF-8 JSON.') };
    }
    return { text, bytes: length };
  } catch (error) {
    if (error.code === 'ENOENT') return { error: diagnostic('RECORD_DISAPPEARED', relative, 'The record changed while it was being read.') };
    if (error.code === 'ELOOP') return { error: diagnostic('SYMLINK_REJECTED', relative, 'Symbolic links are not allowed in the knowledge registry.') };
    throw error;
  } finally {
    await handle?.close();
  }
}

function stableDiagnostics(items) {
  return items.sort((left, right) => compareText(left.path, right.path)
    || compareText(left.code, right.code)
    || compareText(left.fieldPath ?? '', right.fieldPath ?? '')
    || compareText(left.message, right.message));
}

async function enumerateRecordFiles(recordsRoot, diagnostics) {
  const files = [];
  let entriesVisited = 0;
  let entryLimitReported = false;
  let fileLimitReported = false;

  async function walk(directory, segments, directoryDepth) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      if (entriesVisited >= MAX_DISCOVERED_ENTRIES) {
        if (!entryLimitReported) {
          diagnostics.push(diagnostic('SCAN_ENTRY_LIMIT', relativePath(segments), `The registry scan stopped after ${MAX_DISCOVERED_ENTRIES} filesystem entries.`));
          entryLimitReported = true;
        }
        return;
      }
      entriesVisited += 1;
      const entrySegments = [...segments, entry.name];
      const rel = relativePath(entrySegments);
      if (!ensureSingleComponent(entry.name)) {
        diagnostics.push(diagnostic('INVALID_ENTRY_NAME', rel, 'Filesystem entry names must be single path components.'));
        continue;
      }
      if (entry.isSymbolicLink()) {
        diagnostics.push(diagnostic('SYMLINK_REJECTED', rel, 'Symbolic links are not allowed in the knowledge registry.'));
        continue;
      }

      let stat;
      try {
        stat = await fs.lstat(path.join(directory, entry.name));
      } catch (error) {
        if (error.code === 'ENOENT') {
          diagnostics.push(diagnostic('ENTRY_DISAPPEARED', rel, 'The filesystem entry changed during the registry scan.'));
          continue;
        }
        throw error;
      }
      if (stat.isSymbolicLink()) {
        diagnostics.push(diagnostic('SYMLINK_REJECTED', rel, 'Symbolic links are not allowed in the knowledge registry.'));
        continue;
      }
      if (stat.isDirectory()) {
        if (directoryDepth >= MAX_DIRECTORY_DEPTH) {
          diagnostics.push(diagnostic('MAX_DEPTH_EXCEEDED', rel, `Registry nesting exceeds ${MAX_DIRECTORY_DEPTH} directory levels.`));
          continue;
        }
        const realPath = await fs.realpath(path.join(directory, entry.name));
        const relative = relativeFilesystemPath(recordsRoot, realPath);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          diagnostics.push(diagnostic('SYMLINK_REJECTED', rel, 'The directory resolves outside the records directory.'));
          continue;
        }
        await walk(path.join(directory, entry.name), entrySegments, directoryDepth + 1);
        if (entriesVisited >= MAX_DISCOVERED_ENTRIES) return;
        continue;
      }
      if (!stat.isFile()) {
        diagnostics.push(diagnostic('UNSUPPORTED_ENTRY', rel, 'Only regular JSON record files and real directories are supported.'));
        continue;
      }
      if (path.extname(entry.name).toLowerCase() !== '.json') {
        diagnostics.push(diagnostic('UNSUPPORTED_FILE', rel, 'Only .json files are read from the records directory.'));
        continue;
      }
      if (files.length >= MAX_RECORD_FILES) {
        if (!fileLimitReported) {
          diagnostics.push(diagnostic('SCAN_FILE_LIMIT', relativePath(segments), `The registry scan stopped after ${MAX_RECORD_FILES} JSON files.`));
          fileLimitReported = true;
        }
        return;
      }
      files.push({ absolutePath: path.join(directory, entry.name), relativePath: rel, stat });
    }
  }

  await walk(recordsRoot, [], 0);
  return files.sort((left, right) => compareText(left.relativePath, right.relativePath));
}

function safeRecordId(record) {
  return typeof record?.id === 'string' && record.id.length <= 144 ? record.id : undefined;
}

/**
 * Read and validate the local, machine-readable game knowledge registry.
 * Only JSON files under docs/game-intelligence/records/ are considered.
 * Invalid and duplicate records are excluded from `records` and explained in `diagnostics`.
 */
export async function loadKnowledge(rootDir) {
  const root = await recordsDirectory(rootDir);
  if (root.missing) {
    return {
      records: [],
      diagnostics: [diagnostic('RECORDS_DIRECTORY_MISSING', 'docs/game-intelligence/records', 'The local knowledge records directory does not exist yet.')],
    };
  }

  const diagnostics = [];
  const recordsRoot = root.directory;
  const realRecordsRoot = await fs.realpath(recordsRoot);
  const realRootRelative = relativeFilesystemPath(recordsRoot, realRecordsRoot);
  if (realRootRelative !== '' && realRootRelative !== '.') {
    throw fail('KNOWLEDGE_PATH_INVALID', 'The records directory resolves through a symbolic link.');
  }

  const files = await enumerateRecordFiles(recordsRoot, diagnostics);
  const candidateRecords = [];
  let totalBytes = 0;
  for (const file of files) {
    if (file.stat.size > MAX_RECORD_FILE_BYTES) {
      diagnostics.push(diagnostic('RECORD_TOO_LARGE', file.relativePath, `Record exceeds the ${MAX_RECORD_FILE_BYTES} byte limit.`));
      continue;
    }
    if (totalBytes + file.stat.size > MAX_TOTAL_RECORD_BYTES) {
      diagnostics.push(diagnostic('SCAN_BYTE_LIMIT', file.relativePath, `The registry scan stopped at the ${MAX_TOTAL_RECORD_BYTES} byte total limit.`));
      break;
    }

    const read = await readBoundedUtf8File(file.absolutePath, file.relativePath, realRecordsRoot, file.stat);
    if (read.error) {
      diagnostics.push(read.error);
      continue;
    }
    totalBytes += read.bytes;
    if (totalBytes > MAX_TOTAL_RECORD_BYTES) {
      diagnostics.push(diagnostic('SCAN_BYTE_LIMIT', file.relativePath, `The registry scan exceeded the ${MAX_TOTAL_RECORD_BYTES} byte total limit.`));
      break;
    }

    let record;
    try {
      record = JSON.parse(read.text);
    } catch {
      diagnostics.push(diagnostic('MALFORMED_JSON', file.relativePath, 'Record file is not valid JSON.'));
      continue;
    }

    let validation;
    try {
      validation = validateKnowledgeRecord(record);
    } catch (error) {
      diagnostics.push(diagnostic('VALIDATOR_FAILED', file.relativePath, `Record validation failed: ${error?.message ?? 'unknown error'}`, { id: safeRecordId(record) }));
      continue;
    }
    if (!validation?.valid) {
      const errors = Array.isArray(validation?.errors) && validation.errors.length > 0
        ? validation.errors
        : [{ path: '', code: 'INVALID_RECORD', message: 'Record validation failed without a field diagnostic.' }];
      for (const error of errors.slice(0, MAX_VALIDATION_ERRORS_PER_RECORD)) {
        diagnostics.push(diagnostic(
          'INVALID_RECORD',
          file.relativePath,
          error?.message ?? 'Record validation failed.',
          {
            id: safeRecordId(record),
            fieldPath: typeof error?.path === 'string' ? error.path.slice(0, 256) : '',
            validationCode: typeof error?.code === 'string' ? error.code.slice(0, 64) : 'INVALID_RECORD',
          },
        ));
      }
      if (errors.length > MAX_VALIDATION_ERRORS_PER_RECORD) {
        diagnostics.push(diagnostic('VALIDATION_ERRORS_TRUNCATED', file.relativePath, `Record produced ${errors.length} validation errors; only the first ${MAX_VALIDATION_ERRORS_PER_RECORD} are listed.`, {
          id: safeRecordId(record),
          validationErrorCount: errors.length,
        }));
      }
      continue;
    }
    candidateRecords.push({ record, relativePath: file.relativePath });
  }

  const byId = new Map();
  for (const candidate of candidateRecords) {
    const list = byId.get(candidate.record.id) ?? [];
    list.push(candidate);
    byId.set(candidate.record.id, list);
  }

  const uniqueRecords = [];
  for (const [id, candidates] of byId) {
    if (candidates.length > 1) {
      for (const candidate of candidates) {
        diagnostics.push(diagnostic('DUPLICATE_ID', candidate.relativePath, `Record ID ${id} is duplicated; none of its copies are accepted.`, { id }));
      }
      continue;
    }
    uniqueRecords.push(candidates[0]);
  }

  const acceptedIds = new Set(uniqueRecords.map(({ record }) => record.id));
  for (const candidate of uniqueRecords) {
    for (const dependency of candidate.record.dependencies ?? []) {
      if (!acceptedIds.has(dependency.id)) {
        diagnostics.push(diagnostic(
          'MISSING_DEPENDENCY_RECORD',
          candidate.relativePath,
          `Dependency ${dependency.id} is not present as a unique, valid knowledge record.`,
          { id: candidate.record.id, dependencyId: dependency.id },
        ));
      }
    }
    for (const conflict of candidate.record.conflicts ?? []) {
      if (!acceptedIds.has(conflict.id)) {
        diagnostics.push(diagnostic(
          'MISSING_CONFLICT_RECORD',
          candidate.relativePath,
          `Conflict reference ${conflict.id} is not present as a unique, valid knowledge record.`,
          { id: candidate.record.id, conflictId: conflict.id },
        ));
      }
    }
  }

  if (uniqueRecords.length === 0 && diagnostics.length === 0) {
    diagnostics.push(diagnostic('NO_RECORDS_FOUND', 'docs/game-intelligence/records', 'No JSON knowledge records were found.'));
  }
  stableDiagnostics(diagnostics);
  uniqueRecords.sort((left, right) => compareText(left.record.id, right.record.id) || compareText(left.relativePath, right.relativePath));
  return {
    records: uniqueRecords.map(({ record, relativePath: filePath }) => ({ ...record, relativePath: filePath })),
    diagnostics,
  };
}

function normalizeStringFilter(value, name, { maxLength = 200, pattern = null, allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw fail('KNOWLEDGE_FILTER_INVALID', `${name} must be a string.`);
  const normalized = value.trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > maxLength || normalized.includes('\0') || (pattern && !pattern.test(normalized))) {
    throw fail('KNOWLEDGE_FILTER_INVALID', `${name} is not a valid filter value.`);
  }
  return normalized;
}

function normalizeListFilter(value, name, allowedValues = null) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_FILTER_IDS) throw fail('KNOWLEDGE_FILTER_INVALID', `${name} must be an array of at most ${MAX_FILTER_IDS} values.`);
  const normalized = [];
  for (const entry of value) {
    const item = normalizeStringFilter(entry, name, { maxLength: 144, pattern: allowedValues ? null : KNOWLEDGE_ID_PATTERN });
    if (allowedValues && !allowedValues.has(item)) throw fail('KNOWLEDGE_FILTER_INVALID', `${name} contains an unsupported value.`);
    if (!normalized.includes(item)) normalized.push(item);
  }
  return normalized;
}

function normalizeFilters(filters = {}) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    throw fail('KNOWLEDGE_FILTER_INVALID', 'Knowledge filters must be an object.');
  }
  const allowed = new Set(['query', 'kinds', 'familyIds', 'mechanicIds', 'platformState', 'maturity', 'limit']);
  if (Object.keys(filters).some((key) => !allowed.has(key))) {
    throw fail('KNOWLEDGE_FILTER_INVALID', 'Knowledge filters contain an unsupported field.');
  }

  let query = '';
  if (filters.query !== undefined) query = normalizeStringFilter(filters.query, 'query', { maxLength: MAX_QUERY_LENGTH, allowEmpty: true }).toLowerCase();
  const kinds = normalizeListFilter(filters.kinds, 'kinds', KNOWLEDGE_KINDS);
  const familyIds = normalizeListFilter(filters.familyIds, 'familyIds');
  const mechanicIds = normalizeListFilter(filters.mechanicIds, 'mechanicIds');
  let platformState;
  if (filters.platformState !== undefined) {
    platformState = normalizeStringFilter(filters.platformState, 'platformState', { maxLength: 32 });
    if (!PLATFORM_STATES.has(platformState)) throw fail('KNOWLEDGE_FILTER_INVALID', 'platformState is not supported.');
  }
  let maturity;
  if (filters.maturity !== undefined) {
    maturity = normalizeStringFilter(filters.maturity, 'maturity', { maxLength: 2 });
    if (!MATURITY_LEVELS.has(maturity)) throw fail('KNOWLEDGE_FILTER_INVALID', 'maturity is not supported.');
  }
  let limit = 50;
  if (filters.limit !== undefined) {
    if (!Number.isInteger(filters.limit) || filters.limit < 1 || filters.limit > 100) {
      throw fail('KNOWLEDGE_FILTER_INVALID', 'limit must be an integer from 1 to 100.');
    }
    limit = filters.limit;
  }
  return { query, kinds, familyIds, mechanicIds, platformState, maturity, limit };
}

function textIndex(record) {
  const parts = [];
  const visit = (value, depth = 0) => {
    if (depth > 8 || parts.length > 2_000) return;
    if (typeof value === 'string') parts.push(value.toLowerCase());
    else if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        parts.push(key.toLowerCase());
        visit(item, depth + 1);
      }
    }
  };
  visit(record);
  return parts.join('\n');
}

function linkedIds(record) {
  const ids = new Set([record.id]);
  const visit = (value, depth = 0) => {
    if (depth > 8) return;
    if (typeof value === 'string') {
      if (KNOWLEDGE_ID_PATTERN.test(value)) ids.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item, depth + 1);
    }
  };
  visit(record.dependencies);
  visit(record.conflicts);
  visit(record.relatedFamilies);
  visit(record.relatedMechanics);
  return ids;
}

function hasAny(values, candidates) {
  if (values.length === 0) return true;
  return values.some((value) => candidates.has(value));
}

/**
 * Search validated records using bounded, deterministic filters.
 * List filters are ORed within a field; different filter fields are combined with AND.
 */
export async function searchKnowledge(rootDir, filters = {}) {
  const normalized = normalizeFilters(filters);
  const loaded = await loadKnowledge(rootDir);
  const terms = normalized.query.split(/\s+/).filter(Boolean);
  const selected = loaded.records.filter((record) => {
    if (normalized.kinds.length > 0 && !normalized.kinds.includes(record.kind)) return false;
    if (normalized.platformState && record.platformState?.state !== normalized.platformState) return false;
    if (normalized.maturity && record.maturity?.level !== normalized.maturity) return false;
    const ids = linkedIds(record);
    if (!hasAny(normalized.familyIds, ids) || !hasAny(normalized.mechanicIds, ids)) return false;
    if (terms.length > 0) {
      const index = textIndex(record);
      if (!terms.every((term) => index.includes(term))) return false;
    }
    return true;
  });

  const matches = selected.slice(0, normalized.limit).map((record) => ({
    ...record,
    status: record.platformState?.state ?? 'unknown',
  }));
  return {
    matches,
    total: selected.length,
    diagnostics: loaded.diagnostics.slice(0, MAX_RETURNED_DIAGNOSTICS),
    diagnosticCount: loaded.diagnostics.length,
    diagnosticsOmitted: Math.max(0, loaded.diagnostics.length - MAX_RETURNED_DIAGNOSTICS),
    limit: normalized.limit,
  };
}
