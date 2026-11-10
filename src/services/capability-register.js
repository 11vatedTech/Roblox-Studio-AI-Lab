import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveWithin } from '../core/path-policy.js';
import { loadEvidenceRegistry } from './evidence-registry.js';

const REGISTER_PATH = ['docs', 'quality', 'lab-capability-register.json'];
const MAX_REGISTER_BYTES = 2 * 1024 * 1024;
const MAX_CAPABILITIES = 1000;
const CAPABILITY_ID = /^LAB-[A-Z0-9]+-\d{3}$/;
const STATUS = new Set([
  'NOT_STARTED',
  'IN_PROGRESS',
  'IMPLEMENTED',
  'VERIFIED',
  'BLOCKED_EXTERNAL',
  'BLOCKED_HUMAN_APPROVAL',
  'FAILED',
  'DEFERRED_WITH_JUSTIFICATION',
]);
const VERIFICATION_RESULT = new Set(['passed', 'failed', 'blocked', 'not_run', 'unverified']);
const DEFECT_SEVERITY = new Set(['critical', 'high', 'medium', 'low']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addError(errors, location, code, message) {
  errors.push({ path: location, code, message });
}

function text(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function stringArray(value, maxLength, maxCount = 20) {
  return Array.isArray(value) && value.length <= maxCount && value.every((item) => text(item, maxLength));
}

function safeRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.length > 512 || relativePath.includes('\\') || relativePath.startsWith('/')) return null;
  const segments = relativePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /^[a-zA-Z]:/.test(segment) || segment.includes('\0'))) return null;
  return segments;
}

async function checkWorkspacePath(rootDir, relativePath, location, errors, { fileOnly = false } = {}) {
  const segments = safeRelativePath(relativePath);
  if (!segments) {
    addError(errors, location, 'UNSAFE_PATH', 'Use a non-empty workspace-relative path with no traversal or separators inside components.');
    return;
  }
  let target;
  try { target = resolveWithin(rootDir, ...segments); }
  catch {
    addError(errors, location, 'UNSAFE_PATH', 'The path is outside the Lab workspace or traverses a symbolic link.');
    return;
  }
  let stat;
  try { stat = await fs.lstat(target); }
  catch (error) {
    if (error.code === 'ENOENT') addError(errors, location, 'FILE_NOT_FOUND', 'The referenced workspace path does not exist.');
    else addError(errors, location, 'PATH_UNREADABLE', 'The referenced workspace path could not be inspected.');
    return;
  }
  if (stat.isSymbolicLink() || (fileOnly ? !stat.isFile() : !(stat.isFile() || stat.isDirectory()))) {
    addError(errors, location, 'PATH_TYPE_INVALID', fileOnly ? 'The evidence reference must be a regular file.' : 'The implementation reference must be a regular file or directory.');
  }
}

function summarize(capabilities) {
  const summary = Object.fromEntries([...STATUS].map((status) => [status, capabilities.filter((item) => item.status === status).length]));
  summary.total = capabilities.length;
  summary.verified = summary.VERIFIED;
  summary.open = summary.total - summary.verified;
  return summary;
}

function validateVerifiedEvidence(item, base, records, errors) {
  const references = Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [];
  const coveredCriteria = new Set();
  const recordsByReference = new Map();
  for (const record of records) {
    const matches = recordsByReference.get(record.reference) ?? [];
    matches.push(record);
    recordsByReference.set(record.reference, matches);
  }

  for (let index = 0; index < references.length; index += 1) {
    const reference = references[index];
    const matches = recordsByReference.get(reference) ?? [];
    const location = `${base}.evidenceRefs[${index}]`;
    if (matches.length !== 1) {
      addError(errors, location, 'VERIFIED_WITHOUT_TYPED_EVIDENCE', matches.length === 0
        ? 'A VERIFIED capability reference must match a typed record in evidence/registry.json.'
        : 'A VERIFIED capability reference must resolve to exactly one typed evidence record.');
      continue;
    }

    const record = matches[0];
    if (record.status !== 'passed') {
      addError(errors, location, 'VERIFIED_WITHOUT_PASSED_EVIDENCE', 'A VERIFIED capability can use only typed evidence records with passed status.');
    }
    const sourceIdentity = record.validatedDetails?.sourceIdentity;
    if (!sourceIdentity || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sourceIdentity.commit ?? '')
      || !/^[a-f0-9]{64}$/.test(sourceIdentity.treeSha256 ?? '') || typeof sourceIdentity.dirty !== 'boolean') {
      addError(errors, location, 'VERIFIED_EVIDENCE_SOURCE_UNBOUND', 'Typed evidence must identify its Git revision, source-tree digest, and dirty-tree state.');
    }

    const review = record.validatedDetails?.independentReview;
    if (!review || review.status !== 'passed' || review.authorIdentity === review.reviewerIdentity
      || !['distinct-process', 'distinct-human'].includes(review.separation)) {
      addError(errors, location, 'VERIFIED_EVIDENCE_REVIEW_NOT_INDEPENDENT', 'Typed evidence must include a passed review by a separately identified process or human.');
    }

    for (const scope of record.validatedDetails?.capabilityCoverage ?? []) {
      if (scope.capabilityId !== item.id) continue;
      for (const criterionIndex of scope.acceptanceCriteriaIndexes) {
        if (criterionIndex >= item.acceptanceCriteria.length) {
          addError(errors, location, 'VERIFIED_EVIDENCE_COVERAGE_INVALID', 'Typed evidence references an acceptance criterion index that does not exist.');
          continue;
        }
        coveredCriteria.add(criterionIndex);
      }
    }
  }

  const missingCriteria = item.acceptanceCriteria.map((_, index) => index).filter((index) => !coveredCriteria.has(index));
  if (missingCriteria.length > 0) {
    addError(errors, `${base}.evidenceRefs`, 'VERIFIED_EVIDENCE_COVERAGE_INCOMPLETE', `Typed passed evidence must cover every acceptance criterion; uncovered zero-based indexes: ${missingCriteria.join(', ')}.`);
  }
}

export async function validateCapabilityRegister(rootDir, value) {
  const errors = [];
  if (!isObject(value)) return { valid: false, errors: [{ path: '$', code: 'REGISTER_INVALID', message: 'The capability register must be an object.' }] };
  if (value.schemaVersion !== 1) addError(errors, 'schemaVersion', 'SCHEMA_VERSION_INVALID', 'schemaVersion must be 1.');
  if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) addError(errors, 'updatedAt', 'TIMESTAMP_INVALID', 'updatedAt must be a parseable timestamp.');
  if (!Array.isArray(value.capabilities) || value.capabilities.length < 1 || value.capabilities.length > MAX_CAPABILITIES) {
    addError(errors, 'capabilities', 'REGISTER_SIZE_INVALID', `capabilities must contain 1 to ${MAX_CAPABILITIES} entries.`);
    return { valid: false, errors };
  }

  let typedEvidence = [];
  if (value.capabilities.some((item) => isObject(item) && item.status === 'VERIFIED')) {
    try {
      typedEvidence = (await loadEvidenceRegistry(rootDir)).records;
    } catch (error) {
      addError(errors, 'evidence/registry.json', 'VERIFIED_EVIDENCE_REGISTRY_INVALID', `Typed evidence could not be validated: ${error.message}`);
    }
  }

  const ids = new Set();
  for (let index = 0; index < value.capabilities.length; index += 1) {
    const item = value.capabilities[index];
    const base = `capabilities[${index}]`;
    if (!isObject(item)) {
      addError(errors, base, 'CAPABILITY_INVALID', 'A capability entry must be an object.');
      continue;
    }
    if (typeof item.id !== 'string' || !CAPABILITY_ID.test(item.id)) addError(errors, `${base}.id`, 'CAPABILITY_ID_INVALID', 'Capability IDs must use LAB-<DOMAIN>-<three digits>.');
    else if (ids.has(item.id)) addError(errors, `${base}.id`, 'DUPLICATE_CAPABILITY_ID', `Capability ID ${item.id} is duplicated.`);
    else ids.add(item.id);
    if (!text(item.title, 160)) addError(errors, `${base}.title`, 'TITLE_INVALID', 'A title of at most 160 characters is required.');
    if (!STATUS.has(item.status)) addError(errors, `${base}.status`, 'STATUS_INVALID', 'The capability status is not in the accepted lifecycle.');
    if (!stringArray(item.dependencyIds, 64, 64)) addError(errors, `${base}.dependencyIds`, 'DEPENDENCIES_INVALID', 'dependencyIds must be a bounded array of non-empty IDs.');
    else if (item.dependencyIds.includes(item.id) || new Set(item.dependencyIds).size !== item.dependencyIds.length) addError(errors, `${base}.dependencyIds`, 'DEPENDENCIES_INVALID', 'Dependencies cannot include this capability or repeat an ID.');
    if (!Array.isArray(item.implementationPaths) || item.implementationPaths.length < 1 || item.implementationPaths.length > 20) {
      addError(errors, `${base}.implementationPaths`, 'IMPLEMENTATION_PATHS_REQUIRED', 'At least one implementation path is required.');
    } else {
      for (let pathIndex = 0; pathIndex < item.implementationPaths.length; pathIndex += 1) {
        await checkWorkspacePath(rootDir, item.implementationPaths[pathIndex], `${base}.implementationPaths[${pathIndex}]`, errors);
      }
    }
    if (!stringArray(item.acceptanceCriteria, 1000)) addError(errors, `${base}.acceptanceCriteria`, 'ACCEPTANCE_CRITERIA_REQUIRED', 'One to 20 concrete acceptance criteria are required.');
    if (!text(item.verificationMethod, 1000)) addError(errors, `${base}.verificationMethod`, 'VERIFICATION_METHOD_REQUIRED', 'A bounded verification method is required.');
    if (!VERIFICATION_RESULT.has(item.verificationResult)) addError(errors, `${base}.verificationResult`, 'VERIFICATION_RESULT_INVALID', 'Use passed, failed, blocked, not_run, or unverified.');
    if (!stringArray(item.evidenceRefs, 512)) addError(errors, `${base}.evidenceRefs`, 'EVIDENCE_REFS_INVALID', 'evidenceRefs must be a bounded array of workspace-relative file paths.');
    else {
      for (let evidenceIndex = 0; evidenceIndex < item.evidenceRefs.length; evidenceIndex += 1) {
        await checkWorkspacePath(rootDir, item.evidenceRefs[evidenceIndex], `${base}.evidenceRefs[${evidenceIndex}]`, errors, { fileOnly: true });
      }
    }
    if (!Array.isArray(item.outstandingDefects) || item.outstandingDefects.length > 20) addError(errors, `${base}.outstandingDefects`, 'DEFECTS_INVALID', 'outstandingDefects must contain at most 20 entries.');
    else {
      item.outstandingDefects.forEach((defect, defectIndex) => {
        if (!isObject(defect) || !DEFECT_SEVERITY.has(defect.severity) || !text(defect.description, 1000)) addError(errors, `${base}.outstandingDefects[${defectIndex}]`, 'DEFECT_INVALID', 'A defect needs a supported severity and a concise description.');
      });
    }
    if (!stringArray(item.blockers, 1000)) addError(errors, `${base}.blockers`, 'BLOCKERS_INVALID', 'blockers must be a bounded array of strings.');
    if (!stringArray(item.approvalRequirements, 1000)) addError(errors, `${base}.approvalRequirements`, 'APPROVALS_INVALID', 'approvalRequirements must be a bounded array of strings.');
    if (item.status === 'VERIFIED') {
      if (item.verificationResult !== 'passed') addError(errors, `${base}.verificationResult`, 'VERIFIED_WITHOUT_PASS', 'A VERIFIED capability needs a passing verification result.');
      if (!Array.isArray(item.evidenceRefs) || item.evidenceRefs.length === 0) addError(errors, `${base}.evidenceRefs`, 'VERIFIED_WITHOUT_EVIDENCE', 'A VERIFIED capability needs at least one evidence file.');
      if (Array.isArray(item.outstandingDefects) && item.outstandingDefects.some((defect) => defect?.severity === 'critical' || defect?.severity === 'high')) addError(errors, `${base}.outstandingDefects`, 'VERIFIED_WITH_OPEN_DEFECT', 'A capability with an open critical or high defect cannot be VERIFIED.');
      validateVerifiedEvidence(item, base, typedEvidence, errors);
    }
    if (['BLOCKED_EXTERNAL', 'BLOCKED_HUMAN_APPROVAL', 'DEFERRED_WITH_JUSTIFICATION'].includes(item.status)
      && (!Array.isArray(item.blockers) || item.blockers.length === 0)) addError(errors, `${base}.blockers`, 'BLOCKER_REQUIRED', 'Blocked or deferred capabilities need an explicit blocker or justification.');
  }

  const byId = new Map(value.capabilities.filter(isObject).map((item) => [item.id, item]));
  for (let index = 0; index < value.capabilities.length; index += 1) {
    const item = value.capabilities[index];
    if (!isObject(item) || !Array.isArray(item.dependencyIds)) continue;
    for (const dependency of item.dependencyIds) {
      if (!byId.has(dependency)) addError(errors, `capabilities[${index}].dependencyIds`, 'UNKNOWN_DEPENDENCY', `Dependency ${String(dependency)} is not registered.`);
    }
  }
  const visitState = new Map();
  const visit = (id, stack = []) => {
    if (visitState.get(id) === 1) {
      addError(errors, 'capabilities', 'DEPENDENCY_CYCLE', `Capability dependency cycle includes ${[...stack, id].join(' -> ')}.`);
      return;
    }
    if (visitState.get(id) === 2) return;
    visitState.set(id, 1);
    const item = byId.get(id);
    for (const dependency of item?.dependencyIds ?? []) if (byId.has(dependency)) visit(dependency, [...stack, id]);
    visitState.set(id, 2);
  };
  for (const id of byId.keys()) visit(id);
  return { valid: errors.length === 0, errors, summary: summarize(value.capabilities) };
}

export async function loadCapabilityRegister(rootDir) {
  const root = path.resolve(rootDir);
  const rootStat = await fs.lstat(root).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw Object.assign(new Error('The Lab workspace root is not a real directory.'), { code: 'CAPABILITY_REGISTER_ROOT_INVALID', status: 500 });
  const filePath = resolveWithin(root, ...REGISTER_PATH);
  let stat;
  try { stat = await fs.lstat(filePath); }
  catch (error) {
    if (error.code === 'ENOENT') throw Object.assign(new Error('The machine-readable Lab capability register is missing.'), { code: 'CAPABILITY_REGISTER_MISSING', status: 500 });
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_REGISTER_BYTES) throw Object.assign(new Error('The capability register must be a regular JSON file no larger than 2 MiB.'), { code: 'CAPABILITY_REGISTER_INVALID', status: 500 });
  let register;
  try { register = JSON.parse(await fs.readFile(filePath, 'utf8')); }
  catch { throw Object.assign(new Error('The capability register is not valid JSON.'), { code: 'CAPABILITY_REGISTER_INVALID', status: 500 }); }
  const validation = await validateCapabilityRegister(root, register);
  if (!validation.valid) {
    const details = validation.errors.slice(0, 8).map((error) => `${error.path}: ${error.message}`).join(' ');
    throw Object.assign(new Error(`The capability register failed validation. ${details}`), { code: 'CAPABILITY_REGISTER_INVALID', status: 500, details: validation.errors });
  }
  return { schemaVersion: register.schemaVersion, updatedAt: register.updatedAt, summary: validation.summary, capabilities: register.capabilities };
}
