import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { validateProjectName } from '../core/path-policy.js';
import { validateTaskGraph } from '../core/knowledge-record.js';
import { loadKnowledge } from './knowledge-store.js';
import { loadSpecialistRegistry, matchSpecialists, readSpecialistContract } from './specialist-registry.js';
import { buildRojoProject } from './rojo-workflows.js';

const PLAN_ID = /^task-plan\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TASK_ID = /^task\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CAPABILITY_ID = /^(?:engine|genre|mechanic|style|animation|product|production|failure)\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARTIFACT_TYPE = /^[a-z][a-z0-9-]{1,63}$/;
const MAX_TASKS_PER_PLAN = 20;
const MAX_KNOWLEDGE_PER_TASK = 8;
const MAX_PLAN_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
const MAX_EXECUTION_FILE_BYTES = 512 * 1024;
const MAX_EXECUTION_LEASE_MS = 10 * 60 * 1000;
const locks = new Map();
const MUTATION_OUTCOME = Symbol('task-plan-mutation-outcome');

const ALLOWED_TRANSITIONS = Object.freeze({
  proposed: new Set(['approved', 'failed']),
  approved: new Set(['in_progress', 'blocked', 'failed']),
  in_progress: new Set(['blocked', 'review', 'failed']),
  blocked: new Set(['in_progress', 'failed']),
  review: new Set(['in_progress', 'passed', 'failed']),
  failed: new Set(['approved']),
  passed: new Set(),
});

function fail(code, message, status = 400, details = undefined) {
  return Object.assign(new Error(message), { code, status, ...(details === undefined ? {} : { details }) });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value, limit) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}

function slug(value, max = 44) {
  const normalized = String(value ?? '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return normalized || 'work';
}

function safeRelativeSegments(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 512
    && !value.startsWith('/')
    && !value.includes('\\')
    && !value.includes('\0')
    && !value.includes(':')
    && value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function planSegments(project, planId) {
  if (typeof planId !== 'string' || !PLAN_ID.test(planId)) throw fail('TASK_PLAN_ID_INVALID', 'A valid task plan ID is required.');
  return ['projects', project, '.lab', 'task-plans', `${planId}.json`];
}

async function assertRoot(rootDir) {
  const root = path.resolve(rootDir);
  let stat;
  try { stat = await fs.lstat(root); } catch (error) {
    if (error.code === 'ENOENT') throw fail('TASK_WORKSPACE_INVALID', 'The Lab workspace does not exist.', 404);
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail('TASK_WORKSPACE_INVALID', 'The Lab workspace must be a real directory.');
  return root;
}

async function existingDirectory(root, segments, { create = false, missingIsEmpty = false } = {}) {
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try { stat = await fs.lstat(current); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) {
        if (missingIsEmpty) return null;
        throw fail('TASK_PROJECT_NOT_FOUND', 'The selected project does not exist in projects/.', 404);
      }
      try { await fs.mkdir(current); } catch (mkdirError) {
        if (mkdirError.code !== 'EEXIST') throw mkdirError;
      }
      stat = await fs.lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail('TASK_PATH_INVALID', 'Task plan storage must stay inside real project directories.');
  }
  return current;
}

async function projectRootFor(rootDir, project, { createPlanDirectory = false } = {}) {
  try { validateProjectName(project); } catch (error) {
    throw fail('TASK_PROJECT_INVALID', error.message, 400);
  }
  const root = await assertRoot(rootDir);
  const projectRoot = await existingDirectory(root, ['projects', project]);
  const planDirectory = await existingDirectory(root, ['projects', project, '.lab', 'task-plans'], {
    create: createPlanDirectory,
    missingIsEmpty: !createPlanDirectory,
  });
  return { root, projectRoot, planDirectory };
}

async function readSafePlanFile(root, project, planId) {
  const segments = planSegments(project, planId);
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let stat;
    try { stat = await fs.lstat(current); } catch (error) {
      if (error.code === 'ENOENT') throw fail('TASK_PLAN_NOT_FOUND', `Task plan ${planId} does not exist for project ${project}.`, 404);
      throw error;
    }
    const last = index === segments.length - 1;
    if (stat.isSymbolicLink() || (last ? !stat.isFile() : !stat.isDirectory())) {
      throw fail('TASK_PATH_INVALID', 'Task plan paths cannot contain symbolic links or non-file entries.');
    }
    if (last && stat.size > MAX_PLAN_BYTES) throw fail('TASK_PLAN_TOO_LARGE', 'The saved task plan exceeds the 4 MiB limit.', 413);
  }
  const raw = await fs.readFile(current, 'utf8');
  let plan;
  try { plan = JSON.parse(raw); } catch { throw fail('TASK_PLAN_CORRUPT', 'The saved task plan is not valid JSON.', 500); }
  if (!isObject(plan) || plan.id !== planId || plan.project !== project) throw fail('TASK_PLAN_CORRUPT', 'The saved task plan identity does not match its project path.', 500);
  const validation = validateTaskGraph(plan);
  if (!validation.valid) throw fail('TASK_PLAN_CORRUPT', 'The saved task plan fails its graph integrity checks.', 500, { errors: validation.errors });
  const validTimestamp = (value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  if (!Number.isInteger(plan.revision) || plan.revision < 1 || !validTimestamp(plan.createdAt) || !validTimestamp(plan.updatedAt)
    || !Array.isArray(plan.knowledgeIds) || plan.status !== derivePlanStatus(plan.tasks)) {
    throw fail('TASK_PLAN_CORRUPT', 'The saved task plan has an invalid revision, timestamp, knowledge index, or aggregate status.', 500);
  }
  const taskKnowledgeIds = [];
  for (const task of plan.tasks) {
    if (!Array.isArray(task.knowledgeIds) || !Array.isArray(task.knowledgeSnapshot)
      || !Array.isArray(task.inputArtifactTypes) || !Array.isArray(task.inputArtifacts)
      || !Array.isArray(task.outputArtifactTypes)
      || !/^[a-f0-9]{64}$/.test(task.ownerContractSha256 ?? '')
      || !/^[a-f0-9]{64}$/.test(task.reviewerContractSha256 ?? '')
      || task.knowledgeSnapshot.length !== task.knowledgeIds.length
      || task.knowledgeSnapshot.some((record, index) => record?.id !== task.knowledgeIds[index])) {
      throw fail('TASK_PLAN_CORRUPT', `Task ${task.id} has a broken knowledge snapshot or contract digest.`, 500);
    }
    const linkedOutputTypes = new Set(task.artifacts.map((artifact) => artifact.type));
    if (task.outputArtifactTypes.some((type) => !linkedOutputTypes.has(type))
      || task.inputArtifacts.some((artifact) => !task.inputArtifactTypes.includes(artifact.type))) {
      throw fail('TASK_PLAN_CORRUPT', `Task ${task.id} has an incomplete input or output artifact contract.`, 500);
    }
    taskKnowledgeIds.push(...task.knowledgeIds);
  }
  if (new Set(plan.knowledgeIds).size !== plan.knowledgeIds.length
    || JSON.stringify([...new Set(taskKnowledgeIds)].sort()) !== JSON.stringify([...plan.knowledgeIds].sort())) {
    throw fail('TASK_PLAN_CORRUPT', 'The task plan knowledge index does not match its task snapshots.', 500);
  }
  return plan;
}

async function writePlan(planDirectory, plan) {
  const filePath = path.join(planDirectory, `${plan.id}.json`);
  const tempPath = path.join(planDirectory, `.${plan.id}.${randomUUID()}.tmp`);
  const content = `${JSON.stringify(plan, null, 2)}\n`;
  if (Buffer.byteLength(content, 'utf8') > MAX_PLAN_BYTES) throw fail('TASK_PLAN_TOO_LARGE', 'The task plan exceeds the 4 MiB persistence limit.', 413);
  let handle;
  try {
    handle = await fs.open(tempPath, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await renameWithRetry(tempPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function renameWithRetry(sourcePath, targetPath) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(sourcePath, targetPath);
      return;
    } catch (error) {
      if (attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (2 ** attempt)));
    }
  }
}

function validateArray(value, name, pattern, { min = 0, max = 20 } = {}) {
  if (value === undefined && min === 0) return [];
  if (!Array.isArray(value) || value.length < min || value.length > max
    || value.some((item) => typeof item !== 'string' || !pattern.test(item))
    || new Set(value).size !== value.length) {
    throw fail('TASK_PLAN_INVALID', `${name} must contain ${min === 0 ? 'up to' : 'between'} ${min === 0 ? max : `${min} and ${max}`} valid, unique entries.`, 422);
  }
  return value;
}

function validateTaskInput(task, index) {
  if (!isObject(task)) throw fail('TASK_PLAN_INVALID', `tasks[${index}] must be an object.`, 422);
  if (!nonEmpty(task.title, 200)) throw fail('TASK_PLAN_INVALID', `tasks[${index}].title must contain 1–200 characters.`, 422);
  if (!nonEmpty(task.description, 4000)) throw fail('TASK_PLAN_INVALID', `tasks[${index}].description must contain 1–4000 characters.`, 422);
  const capabilityIds = validateArray(task.capabilityIds, `tasks[${index}].capabilityIds`, CAPABILITY_ID, { min: 1 });
  const knowledgeIds = validateArray(task.knowledgeIds, `tasks[${index}].knowledgeIds`, CAPABILITY_ID, { max: MAX_KNOWLEDGE_PER_TASK });
  const inputArtifactTypes = validateArray(task.inputArtifactTypes, `tasks[${index}].inputArtifactTypes`, ARTIFACT_TYPE);
  const outputArtifactTypes = validateArray(task.outputArtifactTypes, `tasks[${index}].outputArtifactTypes`, ARTIFACT_TYPE, { min: 1, max: 12 });
  const inputArtifacts = task.inputArtifacts ?? [];
  if (!Array.isArray(inputArtifacts) || inputArtifacts.length > 20) throw fail('TASK_PLAN_INVALID', `tasks[${index}].inputArtifacts must contain at most 20 linked files.`, 422);
  const normalizedInputs = inputArtifacts.map((item, inputIndex) => {
    if (!isObject(item) || !ARTIFACT_TYPE.test(item.type) || !safeRelativeSegments(item.reference)) {
      throw fail('TASK_PLAN_INVALID', `tasks[${index}].inputArtifacts[${inputIndex}] needs an artifact type and safe project-relative file path.`, 422);
    }
    return { type: item.type, reference: item.reference };
  });
  if (new Set(normalizedInputs.map((item) => item.type)).size !== normalizedInputs.length
    || normalizedInputs.some((item) => !inputArtifactTypes.includes(item.type))) {
    throw fail('TASK_PLAN_INVALID', `tasks[${index}].inputArtifacts must provide unique types requested by inputArtifactTypes.`, 422);
  }
  if (!Array.isArray(task.fileOwnership ?? []) || (task.fileOwnership ?? []).length > 30) {
    throw fail('TASK_PLAN_INVALID', `tasks[${index}].fileOwnership must contain at most 30 paths.`, 422);
  }
  const fileOwnership = (task.fileOwnership ?? []).map((item, ownershipIndex) => {
    if (!isObject(item) || !safeRelativeSegments(item.path) || !['read', 'write'].includes(item.mode)) {
      throw fail('TASK_PLAN_INVALID', `tasks[${index}].fileOwnership[${ownershipIndex}] needs a safe project-relative path and read/write mode.`, 422);
    }
    return { path: item.path, mode: item.mode };
  });
  const dependsOn = task.dependsOn ?? [];
  if (!Array.isArray(dependsOn) || dependsOn.length > 19 || dependsOn.some((value) => !Number.isInteger(value) || value < 0 || value >= index)
    || new Set(dependsOn).size !== dependsOn.length) {
    throw fail('TASK_PLAN_INVALID', `tasks[${index}].dependsOn may reference unique earlier task indexes only.`, 422);
  }
  return {
    title: task.title.trim(),
    description: task.description.trim(),
    capabilityIds,
    knowledgeIds,
    inputArtifactTypes,
    inputArtifacts: normalizedInputs,
    outputArtifactTypes,
    fileOwnership,
    dependsOn,
    ownerId: task.ownerId,
    reviewerId: task.reviewerId,
  };
}

function compactKnowledge(record) {
  return {
    id: record.id,
    kind: record.kind,
    version: record.version,
    summary: record.summary,
    designKnowledge: record.designKnowledge,
    technicalPatterns: record.technicalPatterns,
    dependencies: record.dependencies,
    conflicts: record.conflicts,
    failureModes: record.failureModes,
    testing: record.testing,
    performance: record.performance,
    sourceRefs: record.sourceRefs,
    platformState: record.platformState,
    maturity: record.maturity,
    assumptions: record.assumptions,
    owner: record.owner,
    reviewedAt: record.reviewedAt,
    relativePath: record.relativePath,
  };
}

function taskArtifactId(taskId, type) {
  return `${taskId.slice(5)}-${type}`.slice(0, 160);
}

function snapshotTaskPlan(request, tasks, knowledgeById, assignments) {
  const now = new Date().toISOString();
  const planId = `task-plan.${slug(request.brief.title)}-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const taskIds = tasks.map((task) => `task.${slug(task.title)}-${randomUUID().replaceAll('-', '').slice(0, 10)}`);
  const graphTasks = tasks.map((task, index) => {
    const assignment = assignments[index];
    return {
      id: taskIds[index],
      title: task.title,
      description: task.description,
      status: 'proposed',
      ownerId: assignment.owner.id,
      reviewerId: assignment.reviewer.id,
      capabilityIds: task.capabilityIds,
      knowledgeIds: task.knowledgeIds,
      knowledgeSnapshot: task.knowledgeIds.map((id) => compactKnowledge(knowledgeById.get(id))),
      inputArtifactTypes: task.inputArtifactTypes,
      inputArtifacts: task.inputArtifacts,
      outputArtifactTypes: task.outputArtifactTypes,
      fileOwnership: task.fileOwnership,
      ownerContractSha256: assignment.owner.contractSha256,
      reviewerContractSha256: assignment.reviewer.contractSha256,
      artifacts: task.outputArtifactTypes.map((type) => ({
        id: taskArtifactId(taskIds[index], type),
        type,
        description: `Produce and link the ${type.replaceAll('-', ' ')} artifact.`,
      })),
      evidence: [],
    };
  });
  const edges = [];
  tasks.forEach((task, index) => {
    for (const prerequisiteIndex of task.dependsOn) {
      edges.push({ from: taskIds[index], to: taskIds[prerequisiteIndex], type: 'depends-on' });
    }
  });
  return {
    schemaVersion: 1,
    id: planId,
    project: request.project,
    status: 'proposed',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    brief: { title: request.brief.title.trim(), summary: request.brief.summary.trim() },
    capabilityIds: [...new Set(tasks.flatMap((task) => task.capabilityIds))].sort(),
    knowledgeIds: [...new Set(tasks.flatMap((task) => task.knowledgeIds))].sort(),
    unknowns: request.unknowns ?? [],
    assumptions: request.assumptions ?? [],
    reviewGates: [{
      id: 'independent-review',
      description: 'The assigned reviewer must inspect every linked output and attach execution or certification evidence before the task can pass.',
    }],
    tasks: graphTasks,
    edges,
  };
}

function graphError(validation) {
  return fail('TASK_PLAN_INVALID', 'The task graph failed validation.', 422, { errors: validation.errors });
}

function planLockKey(project, planId) {
  return `${project}/${planId}`;
}

async function withCrossProcessLock(lockPath, action) {
  const token = randomUUID();
  const deadline = Date.now() + 15_000;
  let handle;
  while (!handle) {
    try {
      handle = await fs.open(lockPath, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }), 'utf8');
      await handle.sync();
    } catch (error) {
      await handle?.close().catch(() => {});
      handle = null;
      if (error.code !== 'EEXIST') throw error;
      let stale = false;
      try {
        const stat = await fs.lstat(lockPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw fail('TASK_LOCK_PATH_INVALID', 'Task coordination lock must be a regular local file.', 500);
        const record = JSON.parse(await fs.readFile(lockPath, 'utf8'));
        const age = Date.now() - Date.parse(record.createdAt);
        if (Number.isInteger(record.pid) && record.pid > 0 && age > 60_000) {
          try { process.kill(record.pid, 0); } catch (processError) { if (processError.code === 'ESRCH') stale = true; }
        } else if (!Number.isInteger(record.pid) && Number.isFinite(age) && age > 5 * 60_000) {
          stale = true;
        }
        if (stale) {
          const current = JSON.parse(await fs.readFile(lockPath, 'utf8'));
          if (current.token === record.token) await fs.unlink(lockPath).catch((unlinkError) => { if (unlinkError.code !== 'ENOENT') throw unlinkError; });
        }
      } catch (readError) {
        if (readError.code !== 'ENOENT' && readError.code !== 'TASK_LOCK_PATH_INVALID') {
          // A partially written lock is left alone until its age makes it safely recoverable.
        } else if (readError.code === 'TASK_LOCK_PATH_INVALID') throw readError;
      }
      if (Date.now() >= deadline) throw fail('TASK_LOCK_BUSY', 'Another Lab operation is still changing this project. Retry after it finishes.', 409);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await action();
  } finally {
    await handle.close().catch(() => {});
    try {
      const current = JSON.parse(await fs.readFile(lockPath, 'utf8'));
      if (current.token === token) await fs.unlink(lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

async function withPlanLock(key, action, lockPath = undefined) {
  const previous = locks.get(key) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  locks.set(key, current);
  await previous;
  try {
    return lockPath ? await withCrossProcessLock(lockPath, action) : await action();
  } finally {
    if (locks.get(key) === current) locks.delete(key);
    release();
  }
}

async function withProjectAndPlanLock(rootDir, project, planId, action) {
  if (typeof planId !== 'string' || !PLAN_ID.test(planId)) throw fail('TASK_PLAN_ID_INVALID', 'A valid task plan ID is required.');
  const { planDirectory } = await projectRootFor(rootDir, project, { createPlanDirectory: true });
  const projectLock = path.join(planDirectory, '.project.lock');
  const planLock = path.join(planDirectory, `.${planId}.lock`);
  return withPlanLock(`project:${project}`, () => withPlanLock(planLockKey(project, planId), action, planLock), projectLock);
}

async function assertWorkspaceFile(rootDir, project, reference, { projectOnly = false } = {}) {
  if (!safeRelativeSegments(reference)) throw fail('TASK_PLAN_INVALID', 'Artifact and evidence references must be safe repository-relative paths.', 422);
  const root = await assertRoot(rootDir);
  const projectPrefix = `projects/${project}/`;
  let base;
  let segments;
  if (reference.startsWith(projectPrefix)) {
    base = root;
    segments = reference.split('/');
  } else if (!projectOnly && reference.startsWith('evidence/')) {
    base = root;
    segments = reference.split('/');
  } else {
    const { projectRoot } = await projectRootFor(root, project);
    base = projectRoot;
    segments = reference.split('/');
  }

  let current = base;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let stat;
    try { stat = await fs.lstat(current); } catch (error) {
      if (error.code === 'ENOENT') throw fail('TASK_ARTIFACT_NOT_FOUND', `Linked file does not exist: ${reference}.`, 422);
      throw error;
    }
    const last = index === segments.length - 1;
    if (stat.isSymbolicLink() || (last ? !stat.isFile() : !stat.isDirectory())) {
      throw fail('TASK_ARTIFACT_PATH_INVALID', `Linked file must be a regular file with no symbolic-link components: ${reference}.`, 422);
    }
    if (last && stat.size > MAX_ARTIFACT_BYTES) throw fail('TASK_ARTIFACT_TOO_LARGE', `Linked file exceeds the ${MAX_ARTIFACT_BYTES} byte limit: ${reference}.`, 413);
  }
  const realRoot = await fs.realpath(base);
  const realFile = await fs.realpath(current);
  const relative = path.relative(realRoot, realFile);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw fail('TASK_ARTIFACT_PATH_INVALID', 'Linked file resolves outside its authorized project or evidence directory.', 422);
  }
}

function transitionError(message) {
  return fail('TASK_TRANSITION_INVALID', message, 409);
}

function derivePlanStatus(tasks) {
  if (tasks.length > 0 && tasks.every((task) => task.status === 'passed')) return 'passed';
  if (tasks.some((task) => task.status === 'failed')) return 'failed';
  if (tasks.some((task) => task.status === 'blocked')) return 'blocked';
  if (tasks.some((task) => task.status === 'review')) return 'review';
  if (tasks.some((task) => task.status === 'in_progress')) return 'in_progress';
  if (tasks.some((task) => task.status === 'approved')) return 'approved';
  return 'proposed';
}

export async function createTaskPlan(rootDir, body) {
  if (!isObject(body) || !isObject(body.brief) || !nonEmpty(body.brief.title, 200) || !nonEmpty(body.brief.summary, 4000)) {
    throw fail('TASK_PLAN_INVALID', 'A task plan needs a short brief title and summary.', 422);
  }
  if (!Array.isArray(body.tasks) || body.tasks.length < 1 || body.tasks.length > MAX_TASKS_PER_PLAN) {
    throw fail('TASK_PLAN_INVALID', `A task plan must contain between 1 and ${MAX_TASKS_PER_PLAN} tasks.`, 422);
  }
  if (body.unknowns !== undefined && (!Array.isArray(body.unknowns) || body.unknowns.length > 100 || body.unknowns.some((item) => !nonEmpty(item, 2048)))) {
    throw fail('TASK_PLAN_INVALID', 'unknowns must be an array of at most 100 non-empty strings.', 422);
  }
  if (body.assumptions !== undefined && (!Array.isArray(body.assumptions) || body.assumptions.length > 100 || body.assumptions.some((item) => !nonEmpty(item, 2048)))) {
    throw fail('TASK_PLAN_INVALID', 'assumptions must be an array of at most 100 non-empty strings.', 422);
  }
  const { projectRoot, planDirectory } = await projectRootFor(rootDir, body.project, { createPlanDirectory: true });
  const tasks = body.tasks.map(validateTaskInput);
  const [loadedKnowledge, registry] = await Promise.all([loadKnowledge(rootDir), loadSpecialistRegistry(rootDir)]);
  const knowledgeById = new Map(loadedKnowledge.records.map((record) => [record.id, record]));
  const capabilityIds = new Set(registry.specialists.flatMap((specialist) => specialist.capabilityIds));
  const assignments = [];

  for (const [index, task] of tasks.entries()) {
    const unknown = task.capabilityIds.filter((id) => !capabilityIds.has(id));
    if (unknown.length) {
      throw fail('SPECIALIST_MATCH_NOT_FOUND', `No registered specialist capability matches: ${unknown.join(', ')}.`, 422, { unknownCapabilities: unknown });
    }
    const missingKnowledge = task.knowledgeIds.filter((id) => !knowledgeById.has(id));
    if (missingKnowledge.length) {
      throw fail('TASK_KNOWLEDGE_NOT_FOUND', `Knowledge records are not available as valid local records: ${missingKnowledge.join(', ')}.`, 422, { missingKnowledge });
    }
    for (const ownership of task.fileOwnership) {
      if (ownership.path.startsWith('evidence/') || ownership.path.startsWith('.lab/')) {
        throw fail('TASK_PLAN_INVALID', 'Task ownership paths must stay within ordinary project source and documentation files.', 422);
      }
      const target = path.resolve(projectRoot, ...ownership.path.split('/'));
      const relative = path.relative(projectRoot, target);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw fail('TASK_PLAN_INVALID', `File ownership path escapes project ${body.project}.`, 422);
      }
    }
    for (const input of task.inputArtifacts) await assertWorkspaceFile(rootDir, body.project, input.reference, { projectOnly: true });
    for (const inputType of task.inputArtifactTypes) {
      const providedByDependency = task.dependsOn.some((dependencyIndex) => tasks[dependencyIndex].outputArtifactTypes.includes(inputType));
      const linkedExistingInput = task.inputArtifacts.some((input) => input.type === inputType);
      if (!providedByDependency && !linkedExistingInput) {
        throw fail('TASK_INPUT_UNAVAILABLE', `Task ${index + 1} requires ${inputType}, but no prerequisite task or existing project file provides it.`, 422, { taskIndex: index, inputArtifactType: inputType });
      }
    }
    const match = await matchSpecialists(rootDir, {
      capabilityIds: task.capabilityIds,
      inputArtifactTypes: task.inputArtifactTypes,
      outputArtifactTypes: task.outputArtifactTypes,
      limit: 100,
    });
    const eligible = match.matches.filter((candidate) => !task.ownerId || candidate.specialist.id === task.ownerId);
    if (!eligible.length) {
      throw fail('SPECIALIST_MATCH_NOT_FOUND', `No registered owner and independent reviewer cover task ${index + 1}.`, 422, {
        capabilityIds: task.capabilityIds,
        inputArtifactTypes: task.inputArtifactTypes,
        outputArtifactTypes: task.outputArtifactTypes,
      });
    }
    const selected = eligible[0];
    const requestedReviewer = task.reviewerId ?? selected.reviewerIds[0];
    if (!selected.reviewerIds.includes(requestedReviewer)) {
      throw fail('SPECIALIST_REVIEWER_INVALID', `${requestedReviewer} is not an independent reviewer for ${selected.specialist.id} with the selected output contracts.`, 422);
    }
    const owner = registry.specialists.find((item) => item.id === selected.specialist.id);
    const reviewer = registry.specialists.find((item) => item.id === requestedReviewer);
    assignments.push({ owner, reviewer });
  }

  const plan = snapshotTaskPlan({
    project: body.project,
    brief: { title: body.brief.title, summary: body.brief.summary },
    unknowns: body.unknowns,
    assumptions: body.assumptions,
  }, tasks, knowledgeById, assignments);
  const validation = validateTaskGraph(plan);
  if (!validation.valid) throw graphError(validation);
  await writePlan(planDirectory, plan);
  return plan;
}

export async function readTaskPlan(rootDir, project, planId) {
  const { root } = await projectRootFor(rootDir, project);
  return publicPlan(await readSafePlanFile(root, project, planId));
}

export async function listTaskPlans(rootDir, project) {
  const { root, planDirectory } = await projectRootFor(rootDir, project, { createPlanDirectory: false });
  if (!planDirectory) return [];
  const entries = await fs.readdir(planDirectory, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -5))
    .filter((id) => PLAN_ID.test(id))
    .sort();
  if (names.length > 500) throw fail('TASK_PLAN_LIMIT_EXCEEDED', 'The project contains more than 500 task plans.', 413);
  const plans = [];
  for (const id of names) {
    const plan = await readSafePlanFile(root, project, id);
    plans.push({
      id: plan.id,
      project: plan.project,
      status: plan.status,
      revision: plan.revision,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      title: plan.brief.title,
      summary: plan.brief.summary,
      tasks: plan.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        ownerId: task.ownerId,
        reviewerId: task.reviewerId,
        capabilityIds: task.capabilityIds,
        knowledgeIds: task.knowledgeIds,
        fileOwnership: task.fileOwnership,
        artifacts: task.artifacts,
        evidence: task.evidence,
        execution: task.execution ? {
          attemptCount: task.execution.attemptCount,
          activeRole: task.execution.active?.role ?? null,
          activeProcessId: task.execution.active?.actor.processId ?? null,
          leaseExpiresAt: task.execution.active?.leaseExpiresAt ?? null,
          currentAttemptStatus: task.execution.currentAttempt?.status ?? null,
          ownerProcessId: task.execution.currentAttempt?.owner.processId ?? null,
          reviewerProcessId: task.execution.currentAttempt?.reviewer?.processId ?? null,
          validationStatus: task.execution.currentAttempt?.validation?.status ?? null,
          validationCheckedAt: task.execution.currentAttempt?.validation?.checkedAt ?? null,
        } : null,
      })),
      edges: plan.edges,
    });
  }
  return plans.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
}

export async function getTaskHandoff(rootDir, project, planId, taskId) {
  const plan = await readTaskPlan(rootDir, project, planId);
  const task = plan.tasks.find((item) => item.id === taskId);
  if (!task) throw fail('TASK_NOT_FOUND', `Task ${taskId} does not exist in plan ${planId}.`, 404);
  const registry = await loadSpecialistRegistry(rootDir);
  const ownerResult = await readSpecialistContract(rootDir, task.ownerId);
  const reviewerResult = await readSpecialistContract(rootDir, task.reviewerId);
  const owner = ownerResult.specialist;
  const reviewer = reviewerResult.specialist;
  const allApprovalRequirements = registry.humanApprovalRequirements;
  const changedContracts = [];
  if (createHash('sha256').update(ownerResult.contractText, 'utf8').digest('hex') !== task.ownerContractSha256) changedContracts.push(owner.id);
  if (createHash('sha256').update(reviewerResult.contractText, 'utf8').digest('hex') !== task.reviewerContractSha256) changedContracts.push(reviewer.id);
  return {
    schemaVersion: 1,
    plan: { id: plan.id, project: plan.project, brief: plan.brief, revision: plan.revision },
    generatedAt: new Date().toISOString(),
    task: publicPlan({ tasks: [task] }).tasks[0],
    owner: { ...owner, contractText: ownerResult.contractText },
    reviewer: { ...reviewer, contractText: reviewerResult.contractText },
    knowledge: task.knowledgeSnapshot,
    operationBoundary: {
      permitted: owner.permittedOperationClasses,
      forbidden: registry.forbiddenOperationClasses,
      approvalRequirements: allApprovalRequirements,
      note: 'This handoff is a task contract. An approved task can be claimed through the fixed Lab Tasks MCP server; the handoff alone does not launch a model or authorize operations outside the listed permissions.',
    },
    contractWarnings: changedContracts.length ? { roleContractsChangedSincePlanning: changedContracts } : null,
  };
}

export async function updateTask(rootDir, request) {
  if (!isObject(request)) throw fail('TASK_PLAN_INVALID', 'A task transition request must be an object.', 422);
  const { project, planId, taskId, expectedRevision, status } = request;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw fail('TASK_REVISION_REQUIRED', 'expectedRevision must be a positive integer.', 428);
  if (typeof taskId !== 'string' || !TASK_ID.test(taskId)) throw fail('TASK_ID_INVALID', 'A valid task ID is required.');
  return withProjectAndPlanLock(rootDir, project, planId, async () => {
    const { root, planDirectory } = await projectRootFor(rootDir, project);
    const plan = await readSafePlanFile(root, project, planId);
    if (expectedRevision !== plan.revision) throw fail('TASK_REVISION_CONFLICT', `Task plan revision is ${plan.revision}; refresh before changing it.`, 409, { expectedRevision, currentRevision: plan.revision });
    const task = plan.tasks.find((item) => item.id === taskId);
    if (!task) throw fail('TASK_NOT_FOUND', `Task ${taskId} does not exist in plan ${planId}.`, 404);
    if (status === 'passed') throw fail('TASK_REVIEW_REQUIRES_EXECUTION', 'A task can pass only through a separate reviewer execution session.', 403);
    if (!ALLOWED_TRANSITIONS[task.status]?.has(status)) throw transitionError(`Task cannot move from ${task.status} to ${String(status)}.`);
    if (status === 'review' && task.execution?.currentAttempt?.status !== 'submitted') {
      throw fail('TASK_EXECUTION_REQUIRED', 'A task must be submitted through the specialist execution workflow before review.', 409);
    }

    if (request.artifactLinks !== undefined) {
      if (!Array.isArray(request.artifactLinks) || request.artifactLinks.length > 20) throw fail('TASK_PLAN_INVALID', 'artifactLinks must contain at most 20 output references.', 422);
      const seen = new Set();
      for (const link of request.artifactLinks) {
        if (!isObject(link) || typeof link.id !== 'string' || !nonEmpty(link.reference, 512) || seen.has(link.id)) {
          throw fail('TASK_PLAN_INVALID', 'Each artifact link needs a unique known artifact ID and local project-relative file path.', 422);
        }
        const artifact = task.artifacts.find((item) => item.id === link.id);
        if (!artifact) throw fail('TASK_ARTIFACT_UNKNOWN', `Artifact ${link.id} is not part of task ${taskId}.`, 422);
        await assertWorkspaceFile(root, project, link.reference, { projectOnly: true });
        artifact.reference = link.reference;
        seen.add(link.id);
      }
    }

    if (request.evidence !== undefined) {
      if (!Array.isArray(request.evidence) || request.evidence.length > 20) throw fail('TASK_PLAN_INVALID', 'evidence must contain at most 20 entries.', 422);
      for (const evidence of request.evidence) {
        if (!isObject(evidence) || !['design', 'execution', 'certification'].includes(evidence.kind)
          || !nonEmpty(evidence.reference, 512) || !nonEmpty(evidence.description, 1000)
          || typeof evidence.observedAt !== 'string') {
          throw fail('TASK_PLAN_INVALID', 'Each evidence entry needs a valid kind, file reference, description, and ISO date.', 422);
        }
        await assertWorkspaceFile(root, project, evidence.reference);
        const recorded = {
          kind: evidence.kind,
          reference: evidence.reference,
          description: evidence.description,
          observedAt: evidence.observedAt,
        };
        if (status === 'passed' && evidence.kind === 'certification') recorded.reviewedBy = request.reviewerId ?? null;
        task.evidence.push(recorded);
      }
    }

    if (status === 'blocked' && !nonEmpty(request.reason, 2000)) throw fail('TASK_BLOCK_REASON_REQUIRED', 'A blocked task needs a concise reason and its next recovery action.', 422);
    if (status === 'failed' && request.reason !== undefined && !nonEmpty(request.reason, 2000)) throw fail('TASK_PLAN_INVALID', 'A failure reason must be a non-empty string of at most 2000 characters.', 422);
    if (status === 'review' || status === 'passed') {
      for (const artifact of task.artifacts) {
        if (!artifact.reference) throw fail('TASK_OUTPUT_MISSING', `Output ${artifact.type} must be linked before review can continue.`, 422);
        await assertWorkspaceFile(root, project, artifact.reference, { projectOnly: true });
      }
    }
    if (['blocked', 'failed'].includes(status) && task.execution?.active) {
      const active = task.execution.active;
      if (task.execution.currentAttempt) {
        task.execution.currentAttempt.status = 'cancelled';
        task.execution.currentAttempt.cancelledAt = new Date().toISOString();
        task.execution.currentAttempt.cancelReason = request.reason?.trim() ?? `Task was moved to ${status} by the Lab operator.`;
      }
      saveHistory(task.execution, { type: 'operator-revoked-claim', attemptId: active.attemptId, actor: active.actor, status, at: new Date().toISOString() });
      task.execution.active = null;
    }
    task.status = status;
    if (status === 'blocked' || status === 'failed') task.reason = request.reason.trim();
    else delete task.reason;
    plan.status = derivePlanStatus(plan.tasks);
    plan.revision += 1;
    plan.updatedAt = new Date().toISOString();
    const validation = validateTaskGraph(plan);
    if (!validation.valid) throw graphError(validation);
    await writePlan(planDirectory, plan);
    return publicPlan(plan);
  });
}

function requireExecutionRef(request) {
  if (!isObject(request)) throw fail('TASK_EXECUTION_INVALID', 'A task execution request must be an object.', 422);
  if (typeof request.taskId !== 'string' || !TASK_ID.test(request.taskId)) throw fail('TASK_ID_INVALID', 'A valid task ID is required.');
}

function checkedActor(actor) {
  if (!isObject(actor) || !nonEmpty(actor.sessionId, 160)
    || !Number.isInteger(actor.processId) || actor.processId < 1
    || !Number.isInteger(actor.parentProcessId) || actor.parentProcessId < 0
    || !isObject(actor.client) || !nonEmpty(actor.client.name, 120)
    || !nonEmpty(actor.client.version, 80)) {
    throw fail('TASK_EXECUTION_ACTOR_INVALID', 'The local task connection did not provide a valid process and MCP client identity.', 422);
  }
  return {
    sessionId: actor.sessionId,
    processId: actor.processId,
    parentProcessId: actor.parentProcessId,
    client: { name: actor.client.name, version: actor.client.version },
  };
}

function ensureExecution(task) {
  task.execution ??= { attemptCount: 0, active: null, currentAttempt: null, stagedOutputs: {}, history: [] };
  task.execution.stagedOutputs ??= {};
  task.execution.history ??= [];
  return task.execution;
}

function executionTokenHash(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    throw fail('TASK_EXECUTION_TOKEN_INVALID', 'This task connection has no valid execution token.', 403);
  }
  return createHash('sha256').update(token, 'utf8').digest();
}

function authorizeExecution(task, token, roles = undefined) {
  const execution = ensureExecution(task);
  if (!execution.active || (roles && !roles.includes(execution.active.role))) {
    throw fail('TASK_EXECUTION_TOKEN_INVALID', 'The task claim is no longer active.', 403);
  }
  const submitted = executionTokenHash(token);
  const expected = Buffer.from(execution.active.tokenHash, 'hex');
  if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
    throw fail('TASK_EXECUTION_TOKEN_INVALID', 'The task claim is invalid or has been revoked.', 403);
  }
  if (Date.parse(execution.active.leaseExpiresAt) <= Date.now()) {
    throw fail('TASK_EXECUTION_LEASE_EXPIRED', 'The task claim expired. Recover the task before retrying it.', 409);
  }
  execution.active.leaseExpiresAt = new Date(Date.now() + (execution.active.leaseDurationMs ?? 90_000)).toISOString();
  return execution;
}

async function mutateTaskPlan(rootDir, request, action) {
  requireExecutionRef(request);
  return withProjectAndPlanLock(rootDir, request.project, request.planId, async () => {
    const { root, planDirectory, projectRoot } = await projectRootFor(rootDir, request.project, { createPlanDirectory: true });
    const plan = await readSafePlanFile(root, request.project, request.planId);
    const task = plan.tasks.find((candidate) => candidate.id === request.taskId);
    if (!task) throw fail('TASK_NOT_FOUND', `Task ${request.taskId} does not exist in plan ${request.planId}.`, 404);
    const response = await action({ root, projectRoot, planDirectory, plan, task });
    if (response?.save === false) return response;
    try {
      plan.status = derivePlanStatus(plan.tasks);
      plan.revision += 1;
      plan.updatedAt = new Date().toISOString();
      const validation = validateTaskGraph(plan);
      if (!validation.valid) throw graphError(validation);
      await writePlan(planDirectory, plan);
    } catch (error) {
      if (response?.[MUTATION_OUTCOME]) await response.rollback?.();
      throw error;
    }
    if (response?.[MUTATION_OUTCOME]) return response.value ?? publicPlan(plan);
    return response === plan ? publicPlan(plan) : (response ?? publicPlan(plan));
  });
}

function mutationOutcome(value, rollback) {
  return { [MUTATION_OUTCOME]: true, value, rollback };
}

function publicPlan(plan) {
  const clone = structuredClone(plan);
  for (const task of clone.tasks ?? []) {
    if (task.execution?.active) delete task.execution.active.tokenHash;
  }
  return clone;
}

function safeSegments(reference) {
  if (!safeRelativeSegments(reference)) throw fail('TASK_EXECUTION_PATH_DENIED', 'The requested file is not a safe repository-relative path.', 422);
  return reference.split('/');
}

async function ensureDirectories(root, segments) {
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try { await fs.mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail('TASK_EXECUTION_PATH_INVALID', 'Task execution paths cannot contain symbolic links or non-directory entries.', 422);
  }
  return current;
}

async function inspectSafeFile(root, segments, { createParents = false } = {}) {
  let current = root;
  const parentSegments = segments.slice(0, -1);
  for (const segment of parentSegments) {
    current = path.join(current, segment);
    let stat;
    try { stat = await fs.lstat(current); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!createParents) return { filePath: path.join(root, ...segments), exists: false };
      await fs.mkdir(current);
      stat = await fs.lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail('TASK_EXECUTION_PATH_INVALID', 'Task execution paths cannot contain symbolic links or non-directory entries.', 422);
  }
  const filePath = path.join(root, ...segments);
  let stat;
  try { stat = await fs.lstat(filePath); } catch (error) {
    if (error.code === 'ENOENT') return { filePath, exists: false };
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw fail('TASK_EXECUTION_PATH_INVALID', 'Task execution files must be regular files with no symbolic-link components.', 422);
  if (stat.size > MAX_EXECUTION_FILE_BYTES) throw fail('TASK_EXECUTION_FILE_TOO_LARGE', `Task files are limited to ${MAX_EXECUTION_FILE_BYTES} bytes.`, 413);
  return { filePath, exists: true, size: stat.size };
}

async function readSafeBytes(root, segments) {
  const target = await inspectSafeFile(root, segments);
  if (!target.exists) return null;
  return fs.readFile(target.filePath);
}

async function atomicWriteSafe(root, segments, bytes) {
  const target = await inspectSafeFile(root, segments, { createParents: true });
  const tempPath = path.join(path.dirname(target.filePath), `.${path.basename(target.filePath)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(tempPath, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await renameWithRetry(tempPath, target.filePath);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

function stageSegments(project, planId, taskId, reference) {
  return ['projects', project, '.lab', 'task-executions', planId, taskId, 'files', ...safeSegments(reference)];
}

async function executionProjectFileState(projectRoot, reference) {
  const segments = safeSegments(reference);
  const bytes = await readSafeBytes(projectRoot, segments);
  return bytes === null ? { bytes: null, sha256: null } : { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function ownership(task, reference) {
  return task.fileOwnership.find((item) => item.path === reference);
}

function overlaps(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

async function assertNoProjectOwnershipConflict(rootDir, project, plan, task) {
  const plans = await listTaskPlans(rootDir, project);
  const targetPaths = task.fileOwnership.filter((item) => item.mode === 'write').map((item) => item.path);
  for (const candidatePlan of plans) {
    if (candidatePlan.id === plan.id) continue;
    for (const candidateTask of candidatePlan.tasks) {
      if (!['in_progress', 'review'].includes(candidateTask.status)) continue;
      const otherPaths = candidateTask.fileOwnership?.filter((item) => item.mode === 'write').map((item) => item.path) ?? [];
      if (targetPaths.some((left) => otherPaths.some((right) => overlaps(left, right)))) {
        throw fail('TASK_EXECUTION_OWNERSHIP_CONFLICT', `Another active Lab task owns a file that overlaps this task's write paths (${candidatePlan.id}/${candidateTask.id}).`, 409);
      }
    }
  }
}

function saveHistory(execution, item) {
  execution.history.push(item);
  if (execution.history.length > 100) execution.history.splice(0, execution.history.length - 100);
}

export async function claimTaskExecution(rootDir, request) {
  const actor = checkedActor(request?.actor);
  if (!['owner', 'reviewer'].includes(request?.role)) throw fail('TASK_EXECUTION_ROLE_INVALID', 'Claim the task as its assigned owner or reviewer.', 422);
  const leaseDurationMs = request.leaseMs ?? 5 * 60_000;
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 1000 || leaseDurationMs > MAX_EXECUTION_LEASE_MS) {
    throw fail('TASK_EXECUTION_LEASE_INVALID', 'Task claim leases must be between 1 second and 10 minutes.', 422);
  }
  const token = randomBytes(32).toString('base64url');
  return mutateTaskPlan(rootDir, request, async ({ root, plan, task }) => {
    const execution = ensureExecution(task);
    if (execution.active) throw fail('TASK_EXECUTION_ALREADY_CLAIMED', 'Another specialist or reviewer currently holds this task claim.', 409);
    const expectedSpecialist = request.role === 'owner' ? task.ownerId : task.reviewerId;
    if (request.specialistId !== expectedSpecialist) throw fail('TASK_EXECUTION_ASSIGNMENT_DENIED', 'This task is assigned to a different specialist for the requested role.', 403);
    if (request.role === 'owner') {
      if (!['approved', 'in_progress'].includes(task.status)) throw fail('TASK_EXECUTION_STATE_INVALID', 'The owner can claim only an approved task or a task explicitly resumed for remediation.', 409);
      await assertNoProjectOwnershipConflict(root, plan.project, plan, task);
      if (task.status === 'approved') task.status = 'in_progress';
      execution.attemptCount += 1;
      const attemptId = randomUUID();
      execution.currentAttempt = {
        id: attemptId,
        number: execution.attemptCount,
        status: 'working',
        claimedAt: new Date().toISOString(),
        owner: actor,
      };
      saveHistory(execution, { type: 'owner-claimed', attemptId, actor, at: new Date().toISOString() });
    } else {
      if (task.status !== 'review' || execution.currentAttempt?.status !== 'submitted') {
        throw fail('TASK_EXECUTION_STATE_INVALID', 'The reviewer can claim only a specialist submission awaiting review.', 409);
      }
      const author = execution.currentAttempt.owner;
      if (!author || author.processId === actor.processId || author.sessionId === actor.sessionId) {
        throw fail('TASK_REVIEWER_NOT_INDEPENDENT', 'Review must run in a separate MCP server process and session from the author.', 403);
      }
      execution.currentAttempt.reviewerClaimedAt = new Date().toISOString();
      execution.currentAttempt.reviewer = actor;
      saveHistory(execution, { type: 'reviewer-claimed', attemptId: execution.currentAttempt.id, actor, at: new Date().toISOString() });
    }
    execution.active = {
      role: request.role,
      specialistId: expectedSpecialist,
      attemptId: execution.currentAttempt.id,
      tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
      actor,
      claimedAt: new Date().toISOString(),
      leaseDurationMs,
      leaseExpiresAt: new Date(Date.now() + leaseDurationMs).toISOString(),
    };
    const handoff = await getTaskHandoff(rootDir, plan.project, plan.id, task.id);
    return { token, attempt: execution.attemptCount, task: handoff };
  });
}

export async function heartbeatTaskExecution(rootDir, request) {
  return mutateTaskPlan(rootDir, request, async ({ task }) => {
    const execution = authorizeExecution(task, request.token);
    return { leaseExpiresAt: execution.active.leaseExpiresAt, taskStatus: task.status };
  });
}

export async function writeTaskExecutionFile(rootDir, request) {
  if (typeof request?.content !== 'string' || Buffer.byteLength(request.content, 'utf8') < 1
    || Buffer.byteLength(request.content, 'utf8') > MAX_EXECUTION_FILE_BYTES || request.content.includes('\0')) {
    throw fail('TASK_EXECUTION_CONTENT_INVALID', `Task output must be non-empty UTF-8 text no larger than ${MAX_EXECUTION_FILE_BYTES} bytes.`, 413);
  }
  return mutateTaskPlan(rootDir, request, async ({ projectRoot, plan, task }) => {
    const execution = authorizeExecution(task, request.token, ['owner']);
    if (task.status !== 'in_progress') throw fail('TASK_EXECUTION_STATE_INVALID', 'Only an active owner may write while the task is in progress.', 409);
    const reference = request.path;
    const declared = ownership(task, reference);
    if (!declared || declared.mode !== 'write') throw fail('TASK_EXECUTION_PATH_DENIED', 'The task owner may write only exact paths declared with write ownership.', 403);
    if (!task.outputArtifactTypes.includes(request.artifactType)) throw fail('TASK_EXECUTION_ARTIFACT_DENIED', 'The artifact type is not part of this task contract.', 403);
    const outputs = execution.stagedOutputs;
    if (Object.entries(outputs).some(([existingPath, item]) => item.artifactType === request.artifactType && existingPath !== reference)) {
      throw fail('TASK_EXECUTION_ARTIFACT_DUPLICATE', 'Each contracted output type must map to one declared file.', 409);
    }
    const current = outputs[reference];
    if (current && current.artifactType !== request.artifactType) throw fail('TASK_EXECUTION_ARTIFACT_DUPLICATE', 'A declared output file cannot represent multiple artifact types.', 409);
    const before = current ? null : await executionProjectFileState(projectRoot, reference);
    const bytes = Buffer.from(request.content, 'utf8');
    const repositoryRoot = path.dirname(path.dirname(projectRoot));
    await atomicWriteSafe(repositoryRoot, stageSegments(plan.project, plan.id, task.id, reference), bytes);
    outputs[reference] = {
      path: reference,
      artifactType: request.artifactType,
      baseSha256: current ? current.baseSha256 : before.sha256,
      outputSha256: createHash('sha256').update(bytes).digest('hex'),
      stagedReference: path.posix.join('.lab', 'task-executions', plan.id, task.id, 'files', reference),
      updatedAt: new Date().toISOString(),
    };
    execution.currentAttempt.updatedAt = new Date().toISOString();
    return { path: reference, artifactType: request.artifactType, sha256: outputs[reference].outputSha256, byteLength: bytes.byteLength };
  });
}

export async function readTaskExecutionFile(rootDir, request) {
  return mutateTaskPlan(rootDir, request, async ({ projectRoot, plan, task }) => {
    const execution = authorizeExecution(task, request.token, ['owner', 'reviewer']);
    const declared = ownership(task, request.path);
    if (!declared) throw fail('TASK_EXECUTION_PATH_DENIED', 'This file is outside the task read and write contract.', 403);
    const staged = execution.stagedOutputs[request.path];
    const repositoryRoot = path.dirname(path.dirname(projectRoot));
    const base = staged ? repositoryRoot : projectRoot;
    const bytes = await readSafeBytes(base, staged ? stageSegments(plan.project, plan.id, task.id, request.path) : safeSegments(request.path));
    if (bytes === null) throw fail('TASK_ARTIFACT_NOT_FOUND', `The task file does not exist: ${request.path}.`, 404);
    return { path: request.path, staged: Boolean(staged), content: bytes.toString('utf8'), sha256: createHash('sha256').update(bytes).digest('hex') };
  });
}

async function readStagedOutput(projectRoot, plan, task, output) {
  const root = path.dirname(path.dirname(projectRoot));
  const bytes = await readSafeBytes(root, stageSegments(plan.project, plan.id, task.id, output.path));
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== output.outputSha256) {
    throw fail('TASK_EXECUTION_STAGED_OUTPUT_INVALID', `Staged output failed its content hash check: ${output.path}.`, 409);
  }
  if (!bytes.toString('utf8').trim()) throw fail('TASK_EXECUTION_OUTPUT_EMPTY', `Staged output is empty: ${output.path}.`, 422);
  if (path.extname(output.path).toLowerCase() === '.json') {
    try { JSON.parse(bytes.toString('utf8')); } catch { throw fail('TASK_EXECUTION_OUTPUT_INVALID', `Staged JSON output is invalid: ${output.path}.`, 422); }
  }
  return bytes;
}

export async function submitTaskExecution(rootDir, request) {
  return mutateTaskPlan(rootDir, request, async ({ projectRoot, task, plan }) => {
    const execution = authorizeExecution(task, request.token, ['owner']);
    if (task.status !== 'in_progress') throw fail('TASK_EXECUTION_STATE_INVALID', 'Only an in-progress task can be submitted for review.', 409);
    const byType = new Map(Object.values(execution.stagedOutputs).map((item) => [item.artifactType, item]));
    const missing = task.outputArtifactTypes.filter((type) => !byType.has(type));
    if (missing.length) throw fail('TASK_OUTPUT_MISSING', `The task still needs these contracted outputs: ${missing.join(', ')}.`, 422);
    for (const item of byType.values()) await readStagedOutput(projectRoot, plan, task, item);
    for (const artifact of task.artifacts) {
      const output = byType.get(artifact.type);
      artifact.reference = output.path;
    }
    task.status = 'review';
    execution.currentAttempt.status = 'submitted';
    execution.currentAttempt.submittedAt = new Date().toISOString();
    execution.currentAttempt.outputs = Object.values(execution.stagedOutputs).map(({ path: outputPath, artifactType, outputSha256 }) => ({ path: outputPath, artifactType, outputSha256 }));
    saveHistory(execution, { type: 'submitted-for-review', attemptId: execution.currentAttempt.id, actor: execution.active.actor, outputs: execution.currentAttempt.outputs, at: new Date().toISOString() });
    execution.active = null;
    return { taskId: task.id, status: task.status, outputs: execution.currentAttempt.outputs };
  });
}

async function checkProjectOutputConflict(projectRoot, output) {
  const current = await executionProjectFileState(projectRoot, output.path);
  if (current.sha256 !== output.baseSha256) {
    throw fail('TASK_EXECUTION_CONFLICT', `The project file changed after the specialist began work: ${output.path}. Review cannot overwrite it.`, 409);
  }
  return current;
}

async function commitTaskOutputs(projectRoot, plan, task, outputs) {
  const prepared = [];
  for (const output of outputs) {
    const current = await checkProjectOutputConflict(projectRoot, output);
    const bytes = await readStagedOutput(projectRoot, plan, task, output);
    prepared.push({ output, current, bytes });
  }
  const applied = [];
  try {
    for (const item of prepared) {
      await atomicWriteSafe(projectRoot, safeSegments(item.output.path), item.bytes);
      applied.push(item);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const item of applied.reverse()) {
      try {
        if (item.current.bytes === null) await fs.unlink(path.join(projectRoot, ...safeSegments(item.output.path)));
        else await atomicWriteSafe(projectRoot, safeSegments(item.output.path), item.current.bytes);
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) throw fail('TASK_EXECUTION_ROLLBACK_FAILED', 'A project output could not be fully restored after a failed acceptance write.', 500);
    throw error;
  }
  return async () => {
    const rollbackErrors = [];
    for (const item of [...applied].reverse()) {
      try {
        const current = await executionProjectFileState(projectRoot, item.output.path);
        if (current.sha256 !== item.output.outputSha256) continue;
        if (item.current.bytes === null) await fs.unlink(path.join(projectRoot, ...safeSegments(item.output.path)));
        else await atomicWriteSafe(projectRoot, safeSegments(item.output.path), item.current.bytes);
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) throw fail('TASK_EXECUTION_ROLLBACK_FAILED', 'A project output changed while the acceptance record was being saved and could not be fully restored.', 500);
  };
}

async function writeReviewEvidence(root, plan, task, record) {
  const reference = `evidence/task-executions/${plan.id}/${task.id}/${task.execution.currentAttempt.id}.json`;
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
  if (bytes.length > MAX_EXECUTION_FILE_BYTES) throw fail('TASK_EXECUTION_EVIDENCE_TOO_LARGE', 'Review evidence exceeded the Lab file limit.', 413);
  if ((await inspectSafeFile(root, safeSegments(reference))).exists) throw fail('TASK_EXECUTION_EVIDENCE_EXISTS', 'A review evidence record already exists for this attempt.', 409);
  await atomicWriteSafe(root, safeSegments(reference), bytes);
  return reference;
}

function taskNeedsRobloxValidation(outputs) {
  return outputs.some((item) => ['.lua', '.luau'].includes(path.extname(item.path).toLowerCase())
    || item.path === 'default.project.json'
    || item.path.startsWith('src/'));
}

async function runFixedProcess(executable, args, cwd, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-64 * 1024); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-64 * 1024); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ exitCode: code, signal, timedOut, stdout, stderr });
    });
  });
}

async function copyProjectTree(sourceRoot, targetRoot) {
  const files = [];
  let totalBytes = 0;
  async function visit(sourceDirectory, targetDirectory, relativeSegments, depth) {
    if (depth > 30 || files.length > 10_000) throw fail('TASK_VALIDATION_PROJECT_LIMIT', 'Project validation exceeded its directory-depth or file-count limit.', 413);
    const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (['.lab', '.git', '.tools', 'node_modules'].includes(entry.name)) continue;
      const segments = [...relativeSegments, entry.name];
      safeSegments(segments.join('/'));
      const sourcePath = path.join(sourceDirectory, entry.name);
      const targetPath = path.join(targetDirectory, entry.name);
      const stat = await fs.lstat(sourcePath);
      if (stat.isSymbolicLink()) throw fail('TASK_VALIDATION_PROJECT_LINK', `Project validation does not follow symbolic links: ${segments.join('/')}.`, 422);
      if (stat.isDirectory()) {
        await fs.mkdir(targetPath);
        await visit(sourcePath, targetPath, segments, depth + 1);
      } else if (stat.isFile()) {
        if (stat.size > 128 * 1024 * 1024) throw fail('TASK_VALIDATION_FILE_LIMIT', `Project validation file exceeds the 128 MiB limit: ${segments.join('/')}.`, 413);
        totalBytes += stat.size;
        if (totalBytes > 512 * 1024 * 1024) throw fail('TASK_VALIDATION_PROJECT_LIMIT', 'Project validation snapshot exceeds the 512 MiB source limit.', 413);
        const bytes = await fs.readFile(sourcePath);
        if (bytes.length !== stat.size) throw fail('TASK_VALIDATION_SOURCE_CHANGED', `Project file changed while its validation snapshot was copied: ${segments.join('/')}.`, 409);
        await fs.writeFile(targetPath, bytes, { flag: 'wx', mode: 0o600 });
        files.push({ path: segments.join('/'), size: bytes.length });
      } else {
        throw fail('TASK_VALIDATION_PROJECT_ENTRY_INVALID', `Project validation encountered an unsupported file entry: ${segments.join('/')}.`, 422);
      }
    }
  }
  await visit(sourceRoot, targetRoot, [], 0);
  return { files, totalBytes };
}

async function safeToolExecutable(toolRootDir, relativePath) {
  const root = await assertRoot(toolRootDir);
  const segments = safeSegments(relativePath);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) throw fail('TASK_VALIDATION_TOOL_MISSING', `The pinned validation tool is unavailable: ${relativePath}.`, 503);
    if (stat.isSymbolicLink() || (segment === segments.at(-1) ? !stat.isFile() : !stat.isDirectory())) {
      throw fail('TASK_VALIDATION_TOOL_INVALID', 'Pinned validation tool paths must be regular files with no symbolic links.', 500);
    }
  }
  return current;
}

export async function validateTaskExecution(rootDir, request) {
  return mutateTaskPlan(rootDir, request, async ({ root, projectRoot, task, plan }) => {
    const execution = authorizeExecution(task, request.token, ['owner', 'reviewer']);
    if (!['in_progress', 'review'].includes(task.status)) throw fail('TASK_EXECUTION_STATE_INVALID', 'Validation is available only while an owner is working or a reviewer is inspecting the submission.', 409);
    const registry = await loadSpecialistRegistry(rootDir);
    const specialist = registry.specialists.find((item) => item.id === execution.active.specialistId);
    const permitted = new Set(specialist?.permittedOperationClasses ?? []);
    if (!permitted.has('run-local-checks')) throw fail('TASK_EXECUTION_PERMISSION_DENIED', 'The assigned role is not permitted to run local checks for this task.', 403);
    const outputs = Object.values(execution.stagedOutputs);
    const outputDigests = outputs.map(({ path: outputPath, artifactType, outputSha256 }) => ({ path: outputPath, artifactType, outputSha256 }));
    const checks = [];
    let validOutputs = true;
    for (const output of outputs) {
      try { await readStagedOutput(projectRoot, plan, task, output); }
      catch (error) {
        validOutputs = false;
        checks.push({ id: `staged-output:${output.path}`, passed: false, detail: error.message.slice(0, 500) });
      }
    }
    checks.push({ id: 'contract-output-coverage', passed: task.outputArtifactTypes.every((type) => outputs.some((item) => item.artifactType === type)), detail: 'Every output type in the task contract has a staged file.' });
    checks.push({ id: 'staged-output-integrity', passed: validOutputs && outputs.length > 0, detail: validOutputs ? 'Staged file hashes, text bounds, and JSON syntax passed.' : 'At least one staged output failed integrity checks.' });
    const robloxCode = taskNeedsRobloxValidation(outputs);
    const validation = {
      schemaVersion: 1,
      attemptId: execution.active.attemptId,
      checkedAt: new Date().toISOString(),
      processId: process.pid,
      actor: execution.active.actor,
      status: 'failed',
      scope: robloxCode ? 'staged-roblox-project' : 'staged-artifacts',
      source: { files: [], totalBytes: 0 },
      outputs: outputDigests,
      checks,
      toolchain: {},
    };

    if (!robloxCode) {
      validation.checks.push({ id: 'roblox-project-build', passed: true, detail: 'No Luau source or project configuration was changed; no place build was required.' });
    } else {
      const toolRootDir = path.resolve(request.toolRootDir ?? rootDir);
      if (!permitted.has('build-rojo-project')) {
        validation.checks.push({ id: 'rojo-build', passed: false, detail: 'This specialist role is not permitted to run the fixed Rojo project build.' });
      } else if (validOutputs) {
        const snapshotId = randomUUID();
        const snapshotRoot = path.join(root, '.lab-runtime', 'task-validation', snapshotId);
        const snapshotProject = path.join(snapshotRoot, 'projects', plan.project);
        let snapshotCreated = false;
        try {
          const rootStat = await fs.lstat(root);
          if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw fail('TASK_VALIDATION_ROOT_INVALID', 'The Lab workspace root changed during validation.', 500);
          snapshotCreated = true;
          await ensureDirectories(root, ['.lab-runtime', 'task-validation', snapshotId, 'projects', plan.project]);
          validation.source = await copyProjectTree(projectRoot, snapshotProject);
          for (const output of outputs) {
            await checkProjectOutputConflict(projectRoot, output);
            const bytes = await readStagedOutput(projectRoot, plan, task, output);
            await atomicWriteSafe(snapshotProject, safeSegments(output.path), bytes);
          }

          const luauOutputs = outputs.filter((item) => ['.lua', '.luau'].includes(path.extname(item.path).toLowerCase()));
          const parserPath = process.platform === 'win32'
            ? '.tools/luau-0.745/luau-compile.exe'
            : '.tools/luau-0.745/luau-compile';
          if (luauOutputs.length) {
            const parser = await safeToolExecutable(toolRootDir, parserPath);
            const parserHash = createHash('sha256').update(await fs.readFile(parser)).digest('hex');
            validation.toolchain.luau = { release: '0.745', sha256: parserHash };
            let parsePassed = true;
            for (const output of luauOutputs) {
              const run = await runFixedProcess(parser, ['--only-parse', path.join(snapshotProject, ...safeSegments(output.path))], snapshotProject);
              const passed = run.exitCode === 0 && !run.timedOut;
              parsePassed &&= passed;
              if (!passed) checks.push({ id: `luau-parse:${output.path}`, passed: false, detail: (run.stderr || run.stdout || (run.timedOut ? 'Parser timed out.' : 'Parser exited unsuccessfully.')).slice(-1000) });
            }
            if (parsePassed) checks.push({ id: 'luau-parse', passed: true, detail: `${luauOutputs.length} staged Luau file(s) parsed with pinned Luau 0.745.` });
          } else {
            checks.push({ id: 'luau-parse', passed: true, detail: 'No Luau source files were changed.' });
          }

          const specPaths = new Set([
            ...validation.source.files.filter((item) => item.path.endsWith('.cli.spec.luau')).map((item) => item.path),
            ...outputs.filter((item) => item.path.endsWith('.cli.spec.luau')).map((item) => item.path),
          ]);
          let specsPassed = true;
          if (specPaths.size > 200) {
            specsPassed = false;
            checks.push({ id: 'luau-cli-specs', passed: false, detail: 'Project contains more than 200 Roblox-free Luau CLI specs; split validation into a smaller project suite.' });
          } else if (specPaths.size) {
            const runtimePath = process.platform === 'win32'
              ? '.tools/luau-0.745/luau.exe'
              : '.tools/luau-0.745/luau';
            const runtime = await safeToolExecutable(toolRootDir, runtimePath);
            const runtimeHash = createHash('sha256').update(await fs.readFile(runtime)).digest('hex');
            validation.toolchain.luauRuntime = { release: '0.745', sha256: runtimeHash };
            const deadline = Date.now() + 60_000;
            for (const specPath of [...specPaths].sort()) {
              const remainingMs = deadline - Date.now();
              if (remainingMs <= 0) {
                specsPassed = false;
                checks.push({ id: 'luau-cli-specs', passed: false, detail: 'The 60-second project spec budget expired.' });
                break;
              }
              const run = await runFixedProcess(runtime, [path.join(snapshotProject, ...safeSegments(specPath))], snapshotProject, Math.min(15_000, remainingMs));
              if (run.exitCode !== 0 || run.timedOut) {
                specsPassed = false;
                checks.push({ id: `luau-cli-spec:${specPath}`, passed: false, detail: (run.stderr || run.stdout || (run.timedOut ? 'Luau CLI spec timed out.' : 'Luau CLI spec exited unsuccessfully.')).slice(-1000) });
              }
            }
            if (specsPassed) checks.push({ id: 'luau-cli-specs', passed: true, detail: `${specPaths.size} Roblox-free Luau CLI spec(s) passed using pinned Luau 0.745.` });
          } else {
            checks.push({ id: 'luau-cli-specs', passed: true, detail: 'No Roblox-free Luau CLI specs are present in the selected project.' });
          }
          checks.push({ id: 'studio-engine-specs', passed: true, detail: 'Engine-dependent Studio specs were not run; a local Rojo build does not certify Roblox runtime behavior.' });

          const build = await buildRojoProject(snapshotRoot, toolRootDir, plan.project);
          validation.toolchain.rojo = build.operation.rojoVersion ?? null;
          validation.build = {
            status: build.operation.status,
            sourceDigest: build.operation.sourceDigest,
            outputSha256: build.operation.output?.sha256 ?? null,
            outputBytes: build.operation.output?.bytes ?? null,
            diagnostics: build.operation.diagnostics.slice(0, 20),
            failure: build.operation.failure ?? null,
          };
          checks.push({ id: 'rojo-build', passed: build.operation.status === 'passed', detail: build.operation.status === 'passed' ? `Rojo ${build.operation.rojoVersion} built the staged project snapshot (${build.operation.output.bytes} bytes).` : (build.operation.failure?.message ?? 'Rojo build did not pass.') });
        } catch (error) {
          checks.push({ id: 'staged-roblox-validation', passed: false, detail: error.message.slice(0, 1000) });
        } finally {
          if (snapshotCreated) {
            const stat = await fs.lstat(snapshotRoot).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
            if (stat?.isDirectory() && !stat.isSymbolicLink()) {
              for (let attempt = 0; ; attempt += 1) {
                try { await fs.rm(snapshotRoot, { recursive: true, force: true }); break; }
                catch (error) {
                  if (attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
                  await new Promise((resolve) => setTimeout(resolve, 30 * (2 ** attempt)));
                }
              }
            }
          }
        }
      }
    }
    validation.checks = checks;
    validation.status = checks.every((item) => item.passed) ? 'passed' : 'failed';
    execution.currentAttempt.validation = validation;
    saveHistory(execution, { type: 'validation', attemptId: execution.currentAttempt.id, actor: execution.active.actor, status: validation.status, checkedAt: validation.checkedAt, outputs: outputDigests });
    return publicPlan({ tasks: [task] }).tasks[0].execution.currentAttempt.validation;
  });
}

export async function reviewTaskExecution(rootDir, request) {
  if (!['accept', 'reject'].includes(request?.decision) || !nonEmpty(request?.summary, 2000)) {
    throw fail('TASK_REVIEW_INVALID', 'Review needs an accept or reject decision and a concise evidence summary.', 422);
  }
  return mutateTaskPlan(rootDir, request, async ({ root, projectRoot, task, plan }) => {
    const execution = authorizeExecution(task, request.token, ['reviewer']);
    if (task.status !== 'review' || execution.currentAttempt?.status !== 'submitted') throw fail('TASK_EXECUTION_STATE_INVALID', 'This task is no longer awaiting independent review.', 409);
    const reviewer = execution.active.actor;
    const author = execution.currentAttempt.owner;
    if (!author || author.processId === reviewer.processId || author.sessionId === reviewer.sessionId) {
      throw fail('TASK_REVIEWER_NOT_INDEPENDENT', 'Review must run in a separate MCP server process and session from the author.', 403);
    }
    const outputs = Object.values(execution.stagedOutputs);
    const now = new Date().toISOString();
    const codeOutputs = taskNeedsRobloxValidation(outputs);
    const validation = execution.currentAttempt.validation;
    const validatedOutputSet = (validation?.outputs ?? []).map((item) => `${item.path}:${item.outputSha256}`).sort().join('|');
    const currentOutputSet = outputs.map((item) => `${item.path}:${item.outputSha256}`).sort().join('|');
    const validationPassed = Boolean(validation?.status === 'passed' && validatedOutputSet === currentOutputSet
      && (!codeOutputs || (validation.processId === reviewer.processId && validation.actor.sessionId === reviewer.sessionId)));
    if (request.decision === 'accept' && codeOutputs && !validationPassed) {
      throw fail('TASK_EXECUTION_VALIDATION_REQUIRED', 'The reviewer must run the fixed Luau and Rojo checks against the staged project before accepting source changes.', 409);
    }
    const fixedChecks = [
      { id: 'contract-output-coverage', passed: task.outputArtifactTypes.every((type) => outputs.some((item) => item.artifactType === type)), detail: 'Every contracted output type has a staged file.' },
      { id: 'staged-output-content-hashes', passed: true, detail: 'All staged output files match their recorded SHA-256 values.' },
      { id: 'project-base-hashes', passed: true, detail: 'Project source files still match the versions observed when work began.' },
      { id: 'json-syntax', passed: true, detail: 'Any staged .json outputs parse as JSON.' },
      { id: 'reviewer-validation', passed: codeOutputs ? validationPassed : true, detail: codeOutputs ? 'The reviewer’s MCP process ran the pinned Luau parser and staged Rojo build.' : 'Artifact integrity checks passed; a source build was not required.' },
    ];
    if (request.decision === 'reject') {
      execution.currentAttempt.status = 'rejected';
      execution.currentAttempt.reviewedAt = now;
      execution.currentAttempt.reviewer = reviewer;
      execution.currentAttempt.reviewSummary = request.summary.trim();
      saveHistory(execution, { type: 'review-rejected', attemptId: execution.currentAttempt.id, actor: reviewer, summary: request.summary.trim(), at: now });
      execution.active = null;
      task.status = 'in_progress';
      delete task.reason;
      for (const artifact of task.artifacts) delete artifact.reference;
      return { taskId: task.id, status: task.status, decision: 'reject', remediation: request.summary.trim() };
    }

    for (const output of outputs) {
      await readStagedOutput(projectRoot, plan, task, output);
      await checkProjectOutputConflict(projectRoot, output);
    }
    await assertNoProjectOwnershipConflict(rootDir, plan.project, plan, task);
    const evidenceRecord = {
      schemaVersion: 1,
      planId: plan.id,
      taskId: task.id,
      attemptId: execution.currentAttempt.id,
      outcome: 'accepted',
      summary: request.summary.trim(),
      reviewedAt: now,
      author,
      reviewer,
      processSeparation: {
        differentMcpProcess: author.processId !== reviewer.processId,
        differentMcpSession: author.sessionId !== reviewer.sessionId,
        limitation: 'The Lab observes local MCP server process and session identities. Client name and version are self-reported; this record does not attest to an AI provider, model, or human identity.',
      },
      fixedChecks,
      outputs: outputs.map(({ path: outputPath, artifactType, baseSha256, outputSha256 }) => ({ path: outputPath, artifactType, baseSha256, outputSha256 })),
      validation: validation ?? null,
    };
    const evidenceReference = await writeReviewEvidence(root, plan, task, evidenceRecord);
    let rollbackOutputs;
    try {
      rollbackOutputs = await commitTaskOutputs(projectRoot, plan, task, outputs);
    } catch (error) {
      await fs.unlink(path.join(root, ...safeSegments(evidenceReference))).catch(() => {});
      throw error;
    }
    execution.currentAttempt.status = 'accepted';
    execution.currentAttempt.reviewedAt = now;
    execution.currentAttempt.reviewer = reviewer;
    execution.currentAttempt.reviewSummary = request.summary.trim();
    execution.currentAttempt.evidenceReference = evidenceReference;
    execution.active = null;
    task.status = 'passed';
    task.reviewedAt = now;
    delete task.reason;
    for (const artifact of task.artifacts) artifact.reference = outputs.find((item) => item.artifactType === artifact.type).path;
    task.evidence.push({
      kind: 'certification',
      reference: evidenceReference,
      description: request.summary.trim(),
      observedAt: now.slice(0, 10),
      reviewedBy: task.reviewerId,
    });
    saveHistory(execution, { type: 'review-accepted', attemptId: execution.currentAttempt.id, actor: reviewer, summary: request.summary.trim(), evidenceReference, at: now });
    return mutationOutcome(null, async () => {
      try { await rollbackOutputs(); }
      finally { await fs.unlink(path.join(root, ...safeSegments(evidenceReference))).catch(() => {}); }
    });
  });
}

export async function cancelTaskExecution(rootDir, request) {
  if (!nonEmpty(request?.reason, 2000)) throw fail('TASK_BLOCK_REASON_REQUIRED', 'Cancellation needs a reason and recovery action.', 422);
  return mutateTaskPlan(rootDir, request, async ({ task }) => {
    const execution = authorizeExecution(task, request.token, ['owner', 'reviewer']);
    const actor = execution.active.actor;
    const now = new Date().toISOString();
    if (execution.currentAttempt) {
      execution.currentAttempt.status = 'cancelled';
      execution.currentAttempt.cancelledAt = now;
      execution.currentAttempt.cancelReason = request.reason.trim();
    }
    saveHistory(execution, { type: 'cancelled', attemptId: execution.active.attemptId, actor, reason: request.reason.trim(), at: now });
    execution.active = null;
    task.status = 'blocked';
    task.reason = request.reason.trim();
    return { taskId: task.id, status: task.status, reason: task.reason };
  });
}

export async function recoverStaleTaskExecutions(rootDir, project) {
  const summaries = await listTaskPlans(rootDir, project);
  const recovered = [];
  for (const summary of summaries) {
    for (const summarizedTask of summary.tasks) {
      if (!['in_progress', 'review'].includes(summarizedTask.status)) continue;
      const result = await mutateTaskPlan(rootDir, {
        project, planId: summary.id, taskId: summarizedTask.id,
      }, async ({ task }) => {
        const execution = ensureExecution(task);
        if (!execution.active || Date.parse(execution.active.leaseExpiresAt) > Date.now()) return { save: false, recovered: false };
        const active = execution.active;
        const now = new Date().toISOString();
        if (execution.currentAttempt) {
          execution.currentAttempt.status = 'abandoned';
          execution.currentAttempt.abandonedAt = now;
        }
        saveHistory(execution, { type: 'lease-expired', attemptId: active.attemptId, actor: active.actor, at: now });
        execution.active = null;
        task.status = 'blocked';
        task.reason = 'The MCP execution lease expired. Inspect the staged outputs and explicitly resume the task before retrying.';
        return { recovered: true, taskId: task.id, planId: summary.id, reason: task.reason };
      });
      if (result.recovered) recovered.push(result);
    }
  }
  return { project, recovered };
}
