const KIND_PREFIX = Object.freeze({
  'engine-capability': 'engine',
  'game-family': 'genre',
  mechanic: 'mechanic',
  'visual-style': 'style',
  'animation-domain': 'animation',
  'product-pattern': 'product',
  'production-pattern': 'production',
  'failure-pattern': 'failure',
});

const PLATFORM_STATES = new Set([
  'released', 'beta', 'experimental', 'announced', 'delayed', 'deprecated', 'unknown', 'not-applicable',
]);
const MATURITY_LEVELS = new Set(['L1', 'L2', 'L3', 'L4']);
const EVIDENCE_KINDS = new Set(['design', 'execution', 'certification']);
const SOURCE_KINDS = new Set([
  'official-documentation', 'primary-research', 'internal-reference', 'verified-benchmark', 'user-provided', 'other',
]);
const RECORD_ID_PATTERN = /^(engine|genre|mechanic|style|animation|product|production|failure)\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TASK_ID_PATTERN = /^task\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SPECIALIST_ID_PATTERN = /^specialist\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TASK_STATUSES = new Set(['proposed', 'approved', 'in_progress', 'blocked', 'review', 'passed', 'failed']);
const EDGE_TYPES = new Set(['depends-on', 'artifact', 'review']);
const OWNERSHIP_MODES = new Set(['read', 'write']);

function issue(errors, path, code, message) {
  errors.push({ path, code, message });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value, max = 2048) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  if (!isDate(value.slice(0, 10))) return false;
  return Number.isFinite(Date.parse(value));
}

function isRecordId(value) {
  return typeof value === 'string' && RECORD_ID_PATTERN.test(value);
}

function isSafeRelativePath(value) {
  if (!nonEmptyString(value, 2048) || value !== value.trim() || value.includes('\\') || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false;
  return value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..' && !/[\0\r\n:]/.test(segment));
}

function isReference(value) {
  if (!nonEmptyString(value, 2048) || value !== value.trim()) return false;
  if (value.startsWith('https://')) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  }
  return isSafeRelativePath(value);
}

function validateStringArray(value, path, errors, { min = 0, max = 100 } = {}) {
  if (!Array.isArray(value)) {
    issue(errors, path, 'TYPE', 'Expected an array of strings.');
    return;
  }
  if (value.length < min || value.length > max) issue(errors, path, 'LENGTH', `Expected between ${min} and ${max} entries.`);
  value.forEach((item, index) => {
    if (!nonEmptyString(item)) issue(errors, `${path}[${index}]`, 'STRING', 'Expected a non-empty string of at most 2048 characters.');
  });
}

function validateEvidenceList(value, path, errors) {
  if (!Array.isArray(value)) {
    issue(errors, path, 'TYPE', 'Expected an array of evidence references.');
    return [];
  }
  const kinds = [];
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isObject(item)) {
      issue(errors, itemPath, 'TYPE', 'Expected an evidence object.');
      return;
    }
    if (!EVIDENCE_KINDS.has(item.kind)) issue(errors, `${itemPath}.kind`, 'ENUM', 'Evidence kind must be design, execution, or certification.');
    else kinds.push(item.kind);
    if (!isReference(item.reference)) issue(errors, `${itemPath}.reference`, 'REFERENCE', 'Use an HTTPS URL or a safe repository-relative path.');
    if (!nonEmptyString(item.description, 1000)) issue(errors, `${itemPath}.description`, 'STRING', 'Evidence needs a concise description.');
    if (!isDate(item.observedAt)) issue(errors, `${itemPath}.observedAt`, 'DATE', 'Use an ISO date in YYYY-MM-DD form.');
  });
  return kinds;
}

/**
 * Validate one versioned knowledge record without coercing or mutating input.
 * Returns deterministic field-path diagnostics suitable for API responses.
 */
export function validateKnowledgeRecord(record) {
  const errors = [];
  if (!isObject(record)) return { valid: false, errors: [{ path: '', code: 'TYPE', message: 'Expected a knowledge record object.' }] };

  const required = [
    'id', 'kind', 'version', 'summary', 'designKnowledge', 'technicalPatterns', 'dependencies', 'conflicts',
    'failureModes', 'testing', 'performance', 'sourceRefs', 'platformState', 'maturity', 'assumptions', 'owner', 'reviewedAt',
  ];
  for (const key of required) {
    if (!Object.hasOwn(record, key)) issue(errors, key, 'REQUIRED', 'This field is required.');
  }

  const prefix = KIND_PREFIX[record.kind];
  if (!prefix) issue(errors, 'kind', 'ENUM', `Supported record kinds: ${Object.keys(KIND_PREFIX).join(', ')}.`);
  if (typeof record.id !== 'string' || !RECORD_ID_PATTERN.test(record.id)) {
    issue(errors, 'id', 'ID', 'Use a stable ID such as genre.rpg-adventure with a lowercase kebab-case suffix.');
  } else if (prefix && !record.id.startsWith(`${prefix}.`)) {
    issue(errors, 'id', 'KIND_PREFIX', `Record kind ${record.kind} requires the ${prefix}. ID prefix.`);
  }
  if (typeof record.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(record.version)) {
    issue(errors, 'version', 'VERSION', 'Use a semantic record version such as 1.0.0.');
  }
  if (!nonEmptyString(record.summary, 2000)) issue(errors, 'summary', 'STRING', 'Summary must be a non-empty string of at most 2000 characters.');

  if (!isObject(record.designKnowledge) || Object.keys(record.designKnowledge).length === 0) {
    issue(errors, 'designKnowledge', 'OBJECT', 'Provide a non-empty design knowledge object.');
  }
  if (!Array.isArray(record.technicalPatterns)) issue(errors, 'technicalPatterns', 'TYPE', 'Expected an array of technical patterns.');
  else record.technicalPatterns.forEach((pattern, index) => {
    if (!isObject(pattern)) issue(errors, `technicalPatterns[${index}]`, 'TYPE', 'Expected a technical pattern object.');
    else {
      if (!nonEmptyString(pattern.name, 160)) issue(errors, `technicalPatterns[${index}].name`, 'STRING', 'Pattern needs a short name.');
      if (!nonEmptyString(pattern.guidance, 2000)) issue(errors, `technicalPatterns[${index}].guidance`, 'STRING', 'Pattern needs actionable guidance.');
    }
  });

  if (!Array.isArray(record.dependencies)) issue(errors, 'dependencies', 'TYPE', 'Expected an array of dependency links.');
  else record.dependencies.forEach((dependency, index) => {
    const itemPath = `dependencies[${index}]`;
    if (!isObject(dependency)) {
      issue(errors, itemPath, 'TYPE', 'Expected a dependency object.');
      return;
    }
    if (!isRecordId(dependency.id)) issue(errors, `${itemPath}.id`, 'ID', 'Dependency must use a stable typed knowledge ID.');
    if (!['requires', 'supports', 'composes-with', 'pairs-with'].includes(dependency.relation)) issue(errors, `${itemPath}.relation`, 'ENUM', 'Unsupported dependency relation.');
    if (!nonEmptyString(dependency.rationale, 1000)) issue(errors, `${itemPath}.rationale`, 'STRING', 'Dependency needs a concise rationale.');
  });

  if (!Array.isArray(record.conflicts)) issue(errors, 'conflicts', 'TYPE', 'Expected an array of conflict links.');
  else record.conflicts.forEach((conflict, index) => {
    const itemPath = `conflicts[${index}]`;
    if (!isObject(conflict)) {
      issue(errors, itemPath, 'TYPE', 'Expected a conflict object.');
      return;
    }
    if (!isRecordId(conflict.id)) issue(errors, `${itemPath}.id`, 'ID', 'Conflict must use a stable typed knowledge ID.');
    if (!nonEmptyString(conflict.rationale, 1000)) issue(errors, `${itemPath}.rationale`, 'STRING', 'Conflict needs a concise rationale.');
  });

  if (!Array.isArray(record.failureModes)) issue(errors, 'failureModes', 'TYPE', 'Expected an array of failure modes.');
  else record.failureModes.forEach((failure, index) => {
    const itemPath = `failureModes[${index}]`;
    if (!isObject(failure)) {
      issue(errors, itemPath, 'TYPE', 'Expected a failure mode object.');
      return;
    }
    if (!nonEmptyString(failure.id, 160)) issue(errors, `${itemPath}.id`, 'STRING', 'Failure mode needs a stable local identifier.');
    if (!nonEmptyString(failure.description, 1000)) issue(errors, `${itemPath}.description`, 'STRING', 'Describe the failure mode.');
    if (!nonEmptyString(failure.mitigation, 1000)) issue(errors, `${itemPath}.mitigation`, 'STRING', 'Describe a mitigation or diagnostic step.');
  });

  if (!isObject(record.testing)) issue(errors, 'testing', 'OBJECT', 'Expected a testing object.');
  else {
    if (!Array.isArray(record.testing.scenarios)) issue(errors, 'testing.scenarios', 'TYPE', 'Expected repeatable testing scenarios.');
    else record.testing.scenarios.forEach((scenario, index) => {
      const itemPath = `testing.scenarios[${index}]`;
      if (!isObject(scenario)) {
        issue(errors, itemPath, 'TYPE', 'Expected a test scenario object.');
        return;
      }
      for (const key of ['id', 'action', 'expected']) {
        if (!nonEmptyString(scenario[key], 1000)) issue(errors, `${itemPath}.${key}`, 'STRING', `Scenario ${key} must be a non-empty string.`);
      }
    });
    validateStringArray(record.testing.acceptanceCriteria, 'testing.acceptanceCriteria', errors, { max: 100 });
  }

  if (!isObject(record.performance)) issue(errors, 'performance', 'OBJECT', 'Expected a performance considerations object.');
  else validateStringArray(record.performance.considerations, 'performance.considerations', errors, { max: 100 });

  if (!Array.isArray(record.sourceRefs) || record.sourceRefs.length === 0) {
    issue(errors, 'sourceRefs', 'PROVENANCE', 'At least one cited source is required.');
  } else record.sourceRefs.forEach((source, index) => {
    const itemPath = `sourceRefs[${index}]`;
    if (!isObject(source)) {
      issue(errors, itemPath, 'TYPE', 'Expected a source reference object.');
      return;
    }
    if (!nonEmptyString(source.title, 300)) issue(errors, `${itemPath}.title`, 'STRING', 'Source needs a readable title.');
    if (!SOURCE_KINDS.has(source.type)) issue(errors, `${itemPath}.type`, 'ENUM', 'Unsupported source type.');
    if (!isReference(source.reference)) issue(errors, `${itemPath}.reference`, 'REFERENCE', 'Use an HTTPS URL or a safe repository-relative path.');
    if (!isDate(source.retrievedAt)) issue(errors, `${itemPath}.retrievedAt`, 'DATE', 'Use an ISO date in YYYY-MM-DD form.');
  });

  if (!isObject(record.platformState)) issue(errors, 'platformState', 'OBJECT', 'Expected a platform capability-state object.');
  else {
    if (!PLATFORM_STATES.has(record.platformState.state)) issue(errors, 'platformState.state', 'ENUM', 'Unsupported platform feature state.');
    for (const key of ['robloxVersion', 'studioVersion']) {
      if (record.platformState[key] !== null && !nonEmptyString(record.platformState[key], 100)) {
        issue(errors, `platformState.${key}`, 'VERSION', 'Use a version string or explicit null when unknown.');
      }
    }
    if (!isDate(record.platformState.checkedAt)) issue(errors, 'platformState.checkedAt', 'DATE', 'Use an ISO date in YYYY-MM-DD form.');
  }

  if (!isObject(record.maturity)) issue(errors, 'maturity', 'OBJECT', 'Expected a maturity object.');
  else {
    if (!MATURITY_LEVELS.has(record.maturity.level)) issue(errors, 'maturity.level', 'ENUM', 'Maturity level must be L1, L2, L3, or L4.');
    const evidenceKinds = validateEvidenceList(record.maturity.evidence, 'maturity.evidence', errors);
    if (record.maturity.level === 'L3' && !evidenceKinds.includes('execution')) {
      issue(errors, 'maturity.evidence', 'MATURITY_EVIDENCE', 'L3 requires at least one linked execution evidence item.');
    }
    if (record.maturity.level === 'L4') {
      if (!evidenceKinds.includes('execution')) issue(errors, 'maturity.evidence', 'MATURITY_EVIDENCE', 'L4 requires linked execution evidence.');
      if (!evidenceKinds.includes('certification')) issue(errors, 'maturity.evidence', 'MATURITY_EVIDENCE', 'L4 requires linked certification evidence.');
    }
  }

  validateStringArray(record.assumptions, 'assumptions', errors, { max: 100 });
  if (!nonEmptyString(record.owner, 128)) issue(errors, 'owner', 'STRING', 'Owner must identify the accountable discipline or role.');
  if (!isDate(record.reviewedAt)) issue(errors, 'reviewedAt', 'DATE', 'Use an ISO date in YYYY-MM-DD form.');

  return { valid: errors.length === 0, errors };
}

function graphIssue(errors, path, code, message) {
  issue(errors, path, code, message);
}

function adjacencyHasCycle(taskIds, edges) {
  const outgoing = new Map(taskIds.map((id) => [id, []]));
  for (const edge of edges) {
    if (edge?.type === 'depends-on' && outgoing.has(edge.from) && outgoing.has(edge.to)) outgoing.get(edge.from).push(edge.to);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const id of taskIds) if (visit(id)) return true;
  return false;
}

/** Validate a proposed task graph and its dependency / ownership invariants. */
export function validateTaskGraph(graph) {
  const errors = [];
  if (!isObject(graph)) return { valid: false, errors: [{ path: '', code: 'TYPE', message: 'Expected a task graph object.' }] };

  if (graph.schemaVersion !== 1) graphIssue(errors, 'schemaVersion', 'VERSION', 'Task graph schemaVersion must be 1.');
  if (typeof graph.id !== 'string' || !/^task-plan\.[a-z0-9]+(?:-[a-z0-9]+)*$/.test(graph.id)) {
    graphIssue(errors, 'id', 'ID', 'Use a stable task plan ID such as task-plan.signal-garden-multiplayer.');
  }
  if (graph.project !== null && !nonEmptyString(graph.project, 128)) graphIssue(errors, 'project', 'STRING', 'Project must be a non-empty slug or null for an unassigned concept.');
  if (!TASK_STATUSES.has(graph.status)) graphIssue(errors, 'status', 'ENUM', 'Unsupported task plan status.');
  if (!isDateTime(graph.createdAt)) graphIssue(errors, 'createdAt', 'DATE_TIME', 'Use an ISO 8601 timestamp with timezone.');
  if (!isObject(graph.brief) || !nonEmptyString(graph.brief.title, 200) || !nonEmptyString(graph.brief.summary, 4000)) {
    graphIssue(errors, 'brief', 'BRIEF', 'Brief requires a title and summary.');
  }
  if (!Array.isArray(graph.capabilityIds)) graphIssue(errors, 'capabilityIds', 'TYPE', 'Expected an array of capability IDs.');
  else graph.capabilityIds.forEach((id, index) => { if (!isRecordId(id)) graphIssue(errors, `capabilityIds[${index}]`, 'ID', 'Use stable typed knowledge IDs.'); });
  validateStringArray(graph.unknowns, 'unknowns', errors, { max: 100 });
  validateStringArray(graph.assumptions, 'assumptions', errors, { max: 100 });
  if (!Array.isArray(graph.reviewGates)) graphIssue(errors, 'reviewGates', 'TYPE', 'Expected an array of review gates.');
  else graph.reviewGates.forEach((gate, index) => {
    if (!isObject(gate) || !nonEmptyString(gate.id, 128) || !nonEmptyString(gate.description, 1000)) {
      graphIssue(errors, `reviewGates[${index}]`, 'REVIEW_GATE', 'Review gates require an ID and description.');
    }
  });

  if (!Array.isArray(graph.tasks) || graph.tasks.length === 0 || graph.tasks.length > 500) {
    graphIssue(errors, 'tasks', 'LENGTH', 'A task graph must contain between 1 and 500 tasks.');
  }
  if (!Array.isArray(graph.edges)) graphIssue(errors, 'edges', 'TYPE', 'Expected an array of graph edges.');

  const tasks = Array.isArray(graph.tasks) ? graph.tasks : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const taskIds = [];
  const taskById = new Map();
  const writeOwners = new Map();

  tasks.forEach((task, index) => {
    const taskPath = `tasks[${index}]`;
    if (!isObject(task)) {
      graphIssue(errors, taskPath, 'TYPE', 'Expected a task object.');
      return;
    }
    if (typeof task.id !== 'string' || !TASK_ID_PATTERN.test(task.id)) graphIssue(errors, `${taskPath}.id`, 'ID', 'Use a stable task ID such as task.design-combat-loop.');
    else {
      taskIds.push(task.id);
      if (taskById.has(task.id)) graphIssue(errors, `${taskPath}.id`, 'DUPLICATE_ID', `Task ID ${task.id} is duplicated.`);
      taskById.set(task.id, task);
    }
    if (!nonEmptyString(task.title, 200)) graphIssue(errors, `${taskPath}.title`, 'STRING', 'Task needs a short title.');
    if (!nonEmptyString(task.description, 4000)) graphIssue(errors, `${taskPath}.description`, 'STRING', 'Task needs an actionable description.');
    if (!TASK_STATUSES.has(task.status)) graphIssue(errors, `${taskPath}.status`, 'ENUM', 'Unsupported task status.');
    if (typeof task.ownerId !== 'string' || !SPECIALIST_ID_PATTERN.test(task.ownerId)) graphIssue(errors, `${taskPath}.ownerId`, 'SPECIALIST_ID', 'Use a stable registered specialist ID.');
    if (typeof task.reviewerId !== 'string' || !SPECIALIST_ID_PATTERN.test(task.reviewerId)) graphIssue(errors, `${taskPath}.reviewerId`, 'SPECIALIST_ID', 'Use a stable independent reviewer ID.');
    else if (task.ownerId === task.reviewerId) graphIssue(errors, `${taskPath}.reviewerId`, 'SELF_REVIEW', 'A task author cannot certify their own work.');
    if (!Array.isArray(task.capabilityIds)) graphIssue(errors, `${taskPath}.capabilityIds`, 'TYPE', 'Expected an array of capability IDs.');
    else task.capabilityIds.forEach((id, capabilityIndex) => { if (!isRecordId(id)) graphIssue(errors, `${taskPath}.capabilityIds[${capabilityIndex}]`, 'ID', 'Use stable typed knowledge IDs.'); });

    if (!Array.isArray(task.fileOwnership)) graphIssue(errors, `${taskPath}.fileOwnership`, 'TYPE', 'Expected file ownership entries.');
    else task.fileOwnership.forEach((ownership, ownershipIndex) => {
      const ownershipPath = `${taskPath}.fileOwnership[${ownershipIndex}]`;
      if (!isObject(ownership)) {
        graphIssue(errors, ownershipPath, 'TYPE', 'Expected a file ownership object.');
        return;
      }
      if (!isSafeRelativePath(ownership.path)) graphIssue(errors, `${ownershipPath}.path`, 'PATH', 'Use a safe repository-relative file path.');
      if (!OWNERSHIP_MODES.has(ownership.mode)) graphIssue(errors, `${ownershipPath}.mode`, 'ENUM', 'Ownership mode must be read or write.');
      if (ownership.mode === 'write' && isSafeRelativePath(ownership.path)) {
        const owners = writeOwners.get(ownership.path) ?? [];
        owners.push(task.id ?? `${index}`);
        writeOwners.set(ownership.path, owners);
      }
    });

    if (!Array.isArray(task.artifacts)) graphIssue(errors, `${taskPath}.artifacts`, 'TYPE', 'Expected output artifact contracts.');
    else task.artifacts.forEach((artifact, artifactIndex) => {
      const artifactPath = `${taskPath}.artifacts[${artifactIndex}]`;
      if (!isObject(artifact) || !nonEmptyString(artifact.id, 160) || !nonEmptyString(artifact.description, 1000)) {
        graphIssue(errors, artifactPath, 'ARTIFACT', 'Artifacts require an ID and description.');
      } else if (artifact.reference !== undefined && !isReference(artifact.reference)) {
        graphIssue(errors, `${artifactPath}.reference`, 'REFERENCE', 'Use an HTTPS URL or a safe repository-relative path.');
      }
    });
    validateEvidenceList(task.evidence, `${taskPath}.evidence`, errors);
    if (task.status === 'passed') {
      const hasOutput = Array.isArray(task.artifacts) && task.artifacts.some((artifact) => isObject(artifact) && isReference(artifact.reference));
      const evidenceKinds = Array.isArray(task.evidence) ? task.evidence.map((item) => item?.kind) : [];
      if (!hasOutput) graphIssue(errors, `${taskPath}.artifacts`, 'PASS_EVIDENCE', 'A passed task needs at least one linked output artifact.');
      if (!evidenceKinds.some((kind) => kind === 'execution' || kind === 'certification')) graphIssue(errors, `${taskPath}.evidence`, 'PASS_EVIDENCE', 'A passed task needs linked execution or certification evidence.');
    }
  });

  for (const [filePath, owners] of writeOwners) {
    if (owners.length > 1) graphIssue(errors, 'tasks', 'OWNERSHIP_COLLISION', `Multiple tasks claim write ownership of ${filePath}: ${owners.join(', ')}.`);
  }

  const counts = new Map();
  for (const id of taskIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  edges.forEach((edge, index) => {
    const edgePath = `edges[${index}]`;
    if (!isObject(edge)) {
      graphIssue(errors, edgePath, 'TYPE', 'Expected a graph edge object.');
      return;
    }
    if (!counts.has(edge.from)) graphIssue(errors, `${edgePath}.from`, 'UNKNOWN_TASK', 'Edge source task does not exist.');
    if (!counts.has(edge.to)) graphIssue(errors, `${edgePath}.to`, 'UNKNOWN_TASK', 'Edge target task does not exist.');
    if (!EDGE_TYPES.has(edge.type)) graphIssue(errors, `${edgePath}.type`, 'ENUM', 'Edge type must be depends-on, artifact, or review.');
    if (edge.from === edge.to) graphIssue(errors, edgePath, 'SELF_EDGE', 'A task cannot link to itself.');
  });

  if (adjacencyHasCycle(taskIds, edges)) graphIssue(errors, 'edges', 'DEPENDENCY_CYCLE', 'Dependency edges must form a directed acyclic graph.');
  return { valid: errors.length === 0, errors };
}
