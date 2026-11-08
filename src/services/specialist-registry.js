import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const REGISTRY_PATH = ['docs', 'game-intelligence', 'specialists', 'registry.json'];
const SPECIALIST_ID = /^specialist\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CAPABILITY_ID = /^(?:engine|genre|mechanic|style|animation|product|production|failure)\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARTIFACT_TYPE = /^[a-z][a-z0-9-]{1,63}$/;
const ROLE_PATH = /^skills\/roles\/[a-z0-9-]+\.md$/;
const MAX_REGISTRY_BYTES = 2 * 1024 * 1024;
const MAX_ROLE_BYTES = 1024 * 1024;

function fail(code, message, status = 400, details = undefined) {
  return Object.assign(new Error(message), { code, status, ...(details === undefined ? {} : { details }) });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function comparableFilesystemPath(value) {
  let resolved = path.resolve(value);
  if (process.platform !== 'win32') return resolved;
  const namespacePrefix = String.fromCharCode(92, 92, 63, 92);
  if (resolved.startsWith(namespacePrefix)) resolved = resolved.slice(namespacePrefix.length);
  return resolved.replaceAll('/', String.fromCharCode(92)).toLowerCase();
}

function isStrictlyWithinFilesystemPath(root, target) {
  const base = comparableFilesystemPath(root).replace(/[\\/]+$/, '');
  const candidate = comparableFilesystemPath(target);
  const separator = process.platform === 'win32' ? String.fromCharCode(92) : path.sep;
  return candidate.startsWith(`${base}${separator}`);
}


function stringArray(value, pattern, { min = 0, max = 100 } = {}) {
  return Array.isArray(value)
    && value.length >= min
    && value.length <= max
    && value.every((item) => typeof item === 'string' && pattern.test(item))
    && new Set(value).size === value.length;
}

async function readSafeFile(rootDir, segments, maxBytes) {
  if (!Array.isArray(segments) || segments.length === 0 || segments.some((segment) =>
    typeof segment !== 'string' || !segment || segment === '.' || segment === '..' || /[\\/\0:]/.test(segment))) {
    throw fail('SPECIALIST_PATH_INVALID', 'A registry or role contract path is invalid.');
  }
  const realRoot = path.resolve(rootDir);
  const rootStat = await fs.lstat(realRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw fail('SPECIALIST_PATH_INVALID', 'The Lab root must be a real directory.');

  let current = realRoot;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') throw fail('SPECIALIST_FILE_MISSING', `Required registry or role file is missing: ${segments.join('/')}.`, 500);
      throw error;
    }
    const last = index === segments.length - 1;
    if (stat.isSymbolicLink() || (last ? !stat.isFile() : !stat.isDirectory())) {
      throw fail('SPECIALIST_PATH_INVALID', `Registry and role paths must be regular files under real directories: ${segments.join('/')}.`);
    }
    if (last && stat.size > maxBytes) throw fail('SPECIALIST_FILE_TOO_LARGE', `Required file exceeds its ${maxBytes} byte limit: ${segments.join('/')}.`, 413);
  }

  const realFile = await fs.realpath(current);
  if (!isStrictlyWithinFilesystemPath(realRoot, realFile)) {
    throw fail('SPECIALIST_PATH_INVALID', 'The registry or role contract resolves outside the Lab root.');
  }
  return fs.readFile(realFile, 'utf8');
}

function validateRegistry(registry) {
  if (!isObject(registry) || registry.schemaVersion !== 1
    || !Array.isArray(registry.divisions) || registry.divisions.length !== 5
    || !stringArray(registry.allowedOperationClasses, /^[a-z][a-z0-9-]{1,63}$/, { min: 1 })
    || !stringArray(registry.forbiddenOperationClasses, /^[a-z][a-z0-9-]{1,63}$/, { min: 1 })
    || !Array.isArray(registry.humanApprovalRequirements)
    || !Array.isArray(registry.specialists) || registry.specialists.length < 1 || registry.specialists.length > 128) {
    throw fail('SPECIALIST_REGISTRY_INVALID', 'The specialist registry does not match its versioned runtime contract.', 500);
  }
  if (new Set(registry.divisions).size !== registry.divisions.length
    || registry.divisions.some((division) => typeof division !== 'string' || division.length > 80)) {
    throw fail('SPECIALIST_REGISTRY_INVALID', 'The specialist registry contains invalid division names.', 500);
  }
  const allowed = new Set(registry.allowedOperationClasses);
  const forbidden = new Set(registry.forbiddenOperationClasses);
  if ([...forbidden].some((operation) => allowed.has(operation))) {
    throw fail('SPECIALIST_REGISTRY_INVALID', 'An operation cannot be both allowed and forbidden.', 500);
  }

  const approvalIds = new Set();
  for (const requirement of registry.humanApprovalRequirements) {
    if (!isObject(requirement) || typeof requirement.id !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(requirement.id)
      || typeof requirement.requirement !== 'string' || !requirement.requirement.trim() || approvalIds.has(requirement.id)) {
      throw fail('SPECIALIST_REGISTRY_INVALID', 'The specialist registry contains an invalid human approval requirement.', 500);
    }
    approvalIds.add(requirement.id);
  }

  const ids = new Set();
  for (const specialist of registry.specialists) {
    if (!isObject(specialist) || typeof specialist.id !== 'string' || !SPECIALIST_ID.test(specialist.id) || ids.has(specialist.id)) {
      throw fail('SPECIALIST_REGISTRY_INVALID', 'The specialist registry contains a missing or duplicate specialist ID.', 500);
    }
    ids.add(specialist.id);
    if (!registry.divisions.includes(specialist.division) || typeof specialist.displayName !== 'string'
      || !specialist.displayName.trim() || typeof specialist.contractPath !== 'string' || !ROLE_PATH.test(specialist.contractPath)) {
      throw fail('SPECIALIST_REGISTRY_INVALID', `Specialist ${specialist.id} has an invalid division, name, or role path.`, 500);
    }
    if (!stringArray(specialist.capabilityIds, CAPABILITY_ID, { min: 1 })
      || !stringArray(specialist.inputArtifactTypes, ARTIFACT_TYPE, { min: 1 })
      || !stringArray(specialist.outputArtifactTypes, ARTIFACT_TYPE, { min: 1 })
      || !stringArray(specialist.permittedOperationClasses, /^[a-z][a-z0-9-]{1,63}$/, { min: 1 })
      || !stringArray(specialist.independentReviewerIds, SPECIALIST_ID, { min: 1 })
      || !stringArray(specialist.humanApprovalRequiredFor ?? [], /^[a-z][a-z0-9-]{1,63}$/)) {
      throw fail('SPECIALIST_REGISTRY_INVALID', `Specialist ${specialist.id} has invalid capabilities, artifact contracts, permissions, or reviewers.`, 500);
    }
    if (specialist.permittedOperationClasses.some((operation) => !allowed.has(operation) || forbidden.has(operation))) {
      throw fail('SPECIALIST_REGISTRY_INVALID', `Specialist ${specialist.id} requests an undeclared or forbidden operation.`, 500);
    }
    if (specialist.humanApprovalRequiredFor?.some((id) => !approvalIds.has(id))) {
      throw fail('SPECIALIST_REGISTRY_INVALID', `Specialist ${specialist.id} references an undocumented human approval.`, 500);
    }
  }
  for (const specialist of registry.specialists) {
    if (specialist.independentReviewerIds.some((id) => !ids.has(id) || id === specialist.id)) {
      throw fail('SPECIALIST_REGISTRY_INVALID', `Specialist ${specialist.id} has a missing or non-independent reviewer.`, 500);
    }
  }
}

export async function loadSpecialistRegistry(rootDir) {
  let parsed;
  try {
    parsed = JSON.parse(await readSafeFile(rootDir, REGISTRY_PATH, MAX_REGISTRY_BYTES));
  } catch (error) {
    if (error instanceof SyntaxError) throw fail('SPECIALIST_REGISTRY_INVALID', 'The specialist registry is not valid JSON.', 500);
    throw error;
  }
  validateRegistry(parsed);
  for (const specialist of parsed.specialists) {
    const content = await readSafeFile(rootDir, specialist.contractPath.split('/'), MAX_ROLE_BYTES);
    specialist.contractSha256 = createHash('sha256').update(content, 'utf8').digest('hex');
  }
  return parsed;
}

function normalizeRequest(filters = {}) {
  if (!isObject(filters)) throw fail('SPECIALIST_QUERY_INVALID', 'Specialist requirements must be an object.');
  const readIds = (key, pattern, max) => {
    const values = filters[key] ?? [];
    if (!Array.isArray(values) || values.length > max || values.some((value) => typeof value !== 'string' || !pattern.test(value))) {
      throw fail('SPECIALIST_QUERY_INVALID', `${key} must be an array of valid identifiers.`);
    }
    if (new Set(values).size !== values.length) throw fail('SPECIALIST_QUERY_INVALID', `${key} cannot contain duplicates.`);
    return values;
  };
  return {
    capabilityIds: readIds('capabilityIds', CAPABILITY_ID, 20),
    inputArtifactTypes: readIds('inputArtifactTypes', ARTIFACT_TYPE, 20),
    outputArtifactTypes: readIds('outputArtifactTypes', ARTIFACT_TYPE, 20),
    limit: filters.limit ?? 40,
  };
}

export async function matchSpecialists(rootDir, rawRequirements = {}) {
  const requirements = normalizeRequest(rawRequirements);
  if (!Number.isInteger(requirements.limit) || requirements.limit < 1 || requirements.limit > 100) {
    throw fail('SPECIALIST_QUERY_INVALID', 'limit must be an integer between 1 and 100.');
  }
  const registry = await loadSpecialistRegistry(rootDir);
  const byId = new Map(registry.specialists.map((specialist) => [specialist.id, specialist]));
  const knownCapabilities = new Set(registry.specialists.flatMap((specialist) => specialist.capabilityIds));
  const unknownCapabilities = requirements.capabilityIds.filter((id) => !knownCapabilities.has(id));
  if (unknownCapabilities.length) return { matches: [], unknownCapabilities };

  const matches = registry.specialists.map((specialist) => {
    const missingCapabilities = requirements.capabilityIds.filter((id) => !specialist.capabilityIds.includes(id));
    const missingInputs = requirements.inputArtifactTypes.filter((type) => !specialist.inputArtifactTypes.includes(type));
    const missingOutputs = requirements.outputArtifactTypes.filter((type) => !specialist.outputArtifactTypes.includes(type));
    const reviewerIds = specialist.independentReviewerIds.filter((id) => {
      const reviewer = byId.get(id);
      return reviewer && requirements.outputArtifactTypes.every((type) => reviewer.inputArtifactTypes.includes(type));
    });
    const complete = missingCapabilities.length === 0 && missingInputs.length === 0 && missingOutputs.length === 0;
    const eligible = complete && reviewerIds.length > 0;
    const score = requirements.capabilityIds.length * 100
      + requirements.outputArtifactTypes.length * 10
      + requirements.inputArtifactTypes.length * 2
      + reviewerIds.length;
    return {
      specialist: {
        id: specialist.id,
        displayName: specialist.displayName,
        division: specialist.division,
        contractPath: specialist.contractPath,
        capabilityIds: specialist.capabilityIds,
        inputArtifactTypes: specialist.inputArtifactTypes,
        outputArtifactTypes: specialist.outputArtifactTypes,
        permittedOperationClasses: specialist.permittedOperationClasses,
        independentReviewerIds: specialist.independentReviewerIds,
        humanApprovalRequiredFor: specialist.humanApprovalRequiredFor ?? [],
        contractSha256: specialist.contractSha256,
      },
      coverage: {
        complete,
        missingCapabilities,
        missingInputArtifactTypes: missingInputs,
        missingOutputArtifactTypes: missingOutputs,
      },
      reviewerIds,
      eligible,
      score,
    };
  }).filter((match) => match.eligible)
    .sort((left, right) => right.score - left.score || left.specialist.id.localeCompare(right.specialist.id))
    .slice(0, requirements.limit);

  return { matches, unknownCapabilities: [] };
}

export async function readSpecialistContract(rootDir, specialistId) {
  const registry = await loadSpecialistRegistry(rootDir);
  const specialist = registry.specialists.find((item) => item.id === specialistId);
  if (!specialist) throw fail('SPECIALIST_NOT_FOUND', `Specialist ${specialistId} is not registered.`, 404);
  const contractText = await readSafeFile(rootDir, specialist.contractPath.split('/'), MAX_ROLE_BYTES);
  return { specialist, contractText };
}

export function specialistCapabilities(registry) {
  return [...new Set(registry.specialists.flatMap((specialist) => specialist.capabilityIds))].sort();
}
