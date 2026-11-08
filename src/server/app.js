import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collectEnvironmentSnapshot } from '../core/environment.js';
import { resolveWithin, validateProjectName } from '../core/path-policy.js';
import { StudioMcpClient } from '../services/studio-mcp-client.js';
import { RobloxReferenceClient } from '../services/roblox-reference.js';
import { analyzeProject } from '../services/quality-analysis.js';
import { listCaptures, persistStudioCapture, readCapture } from '../services/capture-store.js';
import { searchKnowledge } from '../services/knowledge-store.js';
import { matchSpecialists } from '../services/specialist-registry.js';
import { createTaskPlan, getTaskHandoff, listTaskPlans, readTaskPlan, updateTask } from '../services/task-plan-store.js';
import { buildRojoProject, getRojoBuildArtifact, inspectRojoProject } from '../services/rojo-workflows.js';
import { loadCapabilityRegister } from '../services/capability-register.js';
import { loadEvidenceRegistry } from '../services/evidence-registry.js';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_CAPTURE_BODY_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_FILE_BYTES = 512 * 1024;
const ALLOWED_TEXT_EXTENSIONS = new Set(['.lua', '.luau', '.json', '.md', '.txt', '.toml', '.yaml', '.yml']);
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '../..');
const DASHBOARD_ROOT = path.join(REPO_ROOT, 'apps', 'control-center', 'public');
const PROJECT_TEMPLATE = path.join(REPO_ROOT, 'roblox', 'templates', 'base');
const STUDIO_PATH_PATTERN = /^(?:game|[A-Za-z_][A-Za-z0-9_]*)(?:\.[A-Za-z_][A-Za-z0-9_]*){0,18}$/;
const KNOWLEDGE_KINDS = new Set(['engine-capability', 'game-family', 'mechanic', 'visual-style', 'animation-domain', 'product-pattern', 'production-pattern', 'failure-pattern']);
const KNOWLEDGE_PLATFORM_STATES = new Set(['released', 'beta', 'experimental', 'announced', 'delayed', 'deprecated', 'unknown', 'not-applicable']);
const KNOWLEDGE_MATURITY_LEVELS = new Set(['L1', 'L2', 'L3', 'L4']);
const KNOWLEDGE_QUERY_KEYS = new Set(['q', 'kind', 'family_id', 'mechanic_id', 'platform_state', 'maturity', 'limit']);

function json(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

function safeError(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'LAB_REQUEST_FAILED',
    message: typeof error?.message === 'string' ? error.message.slice(0, 500) : 'The request could not be completed.',
  };
}

function checkHost(request) {
  const host = request.headers.host;
  if (typeof host !== 'string' || host.length > 255) return false;
  try {
    const url = new URL(`http://${host}`);
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function checkOrigin(request) {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    const target = new URL(origin);
    const host = new URL(`http://${request.headers.host}`);
    return target.protocol === 'http:' && target.host === host.host && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
  } catch {
    return false;
  }
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw Object.assign(new Error('Requests that change local state must use application/json.'), { code: 'JSON_REQUIRED', status: 415 });
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) {
      throw Object.assign(new Error('The request body exceeded the Lab limit.'), { code: 'REQUEST_TOO_LARGE', status: 413 });
    }
    chunks.push(chunk);
  }
  if (length === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
    return value;
  } catch {
    throw Object.assign(new Error('The request body is not a valid JSON object.'), { code: 'INVALID_JSON', status: 400 });
  }
}

function setSecurityHeaders(response) {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

async function walkFiles(basePath, { maxDepth = 8, maxFiles = 500, filter = () => true } = {}) {
  const results = [];
  try {
    const rootStat = await fs.lstat(basePath);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return results;
  } catch (error) {
    if (error.code === 'ENOENT') return results;
    throw error;
  }
  async function walk(current, relative, depth) {
    if (depth > maxDepth || results.length >= maxFiles) return;
    let entries;
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      if (entry.isSymbolicLink()) continue;
      const childPath = path.join(current, entry.name);
      const childRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(childPath, childRelative, depth + 1);
      else if (entry.isFile() && filter(childRelative, entry.name)) {
        const stat = await fs.stat(childPath);
        results.push({ path: childRelative.replaceAll(path.sep, '/'), size: stat.size, modifiedAt: stat.mtime.toISOString() });
        if (results.length >= maxFiles) return;
      }
    }
  }
  await walk(basePath, '', 0);
  return results;
}

async function listProjects(rootDir) {
  const projectsRoot = path.join(rootDir, 'projects');
  let entries;
  try {
    const stat = await fs.lstat(projectsRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return [];
    entries = await fs.readdir(projectsRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const projects = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    try { validateProjectName(entry.name); } catch { continue; }
    const projectDir = resolveWithin(projectsRoot, entry.name);
    let manifest = null;
    try {
      const raw = await fs.readFile(path.join(projectDir, 'lab.project.json'), 'utf8');
      const value = JSON.parse(raw);
      if (value && typeof value === 'object') manifest = value;
    } catch { /* Existing projects do not need a Lab manifest to be listed. */ }
    const files = await walkFiles(projectDir, { maxDepth: 10, maxFiles: 1000 });
    const taskPlans = await listTaskPlans(rootDir, entry.name);
    projects.push({
      name: entry.name,
      displayName: typeof manifest?.displayName === 'string' ? manifest.displayName : entry.name,
      path: `projects/${entry.name}`,
      createdAt: manifest?.createdAt ?? null,
      sourceFiles: files.filter((file) => ['.lua', '.luau'].includes(path.extname(file.path).toLowerCase())).length,
      fileCount: files.length,
      template: manifest?.template ?? null,
      taskPlanCount: taskPlans.length,
      openTaskCount: taskPlans.flatMap((plan) => plan.tasks).filter((task) => !['passed', 'failed'].includes(task.status)).length,
    });
  }
  return projects;
}

async function createProject(rootDir, name) {
  validateProjectName(name);
  const projectsRoot = path.join(rootDir, 'projects');
  await fs.mkdir(projectsRoot, { recursive: true });
  const projectsStat = await fs.lstat(projectsRoot);
  if (projectsStat.isSymbolicLink() || !projectsStat.isDirectory()) {
    throw Object.assign(new Error('The projects directory must be a real directory inside the Lab workspace.'), { code: 'PROJECT_ROOT_INVALID', status: 400 });
  }
  const targetPath = resolveWithin(projectsRoot, name);
  const tempPath = resolveWithin(projectsRoot, `.${name}.staging-${process.pid}-${Date.now()}`);
  try {
    await fs.access(targetPath);
    throw Object.assign(new Error(`A project named ${name} already exists.`), { code: 'PROJECT_EXISTS', status: 409 });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await fs.cp(PROJECT_TEMPLATE, tempPath, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: false });
    const createdAt = new Date().toISOString();
    await fs.writeFile(path.join(tempPath, 'lab.project.json'), `${JSON.stringify({ schemaVersion: 1, name, template: 'roblox-base', createdAt }, null, 2)}\n`, { flag: 'wx' });
    await fs.rename(tempPath, targetPath);
    const files = await walkFiles(targetPath);
    return { name, path: `projects/${name}`, createdAt, template: 'roblox-base', fileCount: files.length };
  } catch (error) {
    await fs.rm(tempPath, { recursive: true, force: true }).catch(() => {});
    if (error.code === 'EEXIST' || error.code === 'ENOTEMPTY') {
      throw Object.assign(new Error(`A project named ${name} already exists.`), { code: 'PROJECT_EXISTS', status: 409 });
    }
    if (error.code === 'ENOENT' && error.path?.startsWith(PROJECT_TEMPLATE)) {
      throw Object.assign(new Error('The Roblox base template is missing from this installation.'), { code: 'PROJECT_TEMPLATE_MISSING', status: 500 });
    }
    throw error;
  }
}

async function resolveProjectRoot(rootDir, name) {
  validateProjectName(name);
  const projectsRoot = path.join(rootDir, 'projects');
  const projectRoot = resolveWithin(projectsRoot, name);
  try {
    const parentStat = await fs.lstat(projectsRoot);
    const projectStat = await fs.lstat(projectRoot);
    if (parentStat.isSymbolicLink() || !parentStat.isDirectory() || projectStat.isSymbolicLink() || !projectStat.isDirectory()) {
      throw Object.assign(new Error('The selected project must be a real local directory inside projects/.'), { code: 'PROJECT_PATH_INVALID', status: 400 });
    }
  } catch (error) {
    if (error.code === 'ENOENT') throw Object.assign(new Error(`Project ${name} does not exist in projects/.`), { code: 'PROJECT_NOT_FOUND', status: 404 });
    throw error;
  }
  return projectRoot;
}

async function readMarkdownIndex(basePath, baseLabel) {
  const files = await walkFiles(basePath, { filter: (relative, name) => name.toLowerCase().endsWith('.md') });
  return files.map((file) => ({ ...file, path: `${baseLabel}/${file.path}` }));
}

async function readExistingTextFile(rootPath, relativePath) {
  const lexicalPath = resolveWithin(rootPath, ...relativePath.split(/[\\/]+/));
  let rootRealPath;
  let targetRealPath;
  try {
    const rootStat = await fs.lstat(rootPath);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw Object.assign(new Error('The selected library root is not a local directory.'), { code: 'LIBRARY_ROOT_INVALID', status: 400 });
    }
    rootRealPath = await fs.realpath(rootPath);
    const targetStat = await fs.lstat(lexicalPath);
    if (targetStat.isSymbolicLink() || !targetStat.isFile() || targetStat.size > MAX_TEXT_FILE_BYTES) {
      throw Object.assign(new Error('The selected document is not a readable local text file.'), { code: 'FILE_NOT_READABLE', status: 404 });
    }
    targetRealPath = await fs.realpath(lexicalPath);
  } catch (error) {
    if (error.code === 'ENOENT') throw Object.assign(new Error('The requested local file does not exist.'), { code: 'FILE_NOT_FOUND', status: 404 });
    throw error;
  }
  const relative = path.relative(rootRealPath, targetRealPath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw Object.assign(new Error('The requested file is outside its allowed library root.'), { code: 'PATH_OUTSIDE_ROOT', status: 400 });
  }
  return fs.readFile(targetRealPath, 'utf8');
}

function studioIdFrom(url) {
  const id = url.searchParams.get('studio_id');
  if (!id || id.length > 256 || /[\r\n\0]/.test(id)) {
    throw Object.assign(new Error('Select a listed Studio instance before requesting its data.'), { code: 'STUDIO_ID_REQUIRED', status: 400 });
  }
  return id;
}

function studioPathFrom(url) {
  const instancePath = url.searchParams.get('path');
  if (!instancePath || instancePath.length > 512 || !STUDIO_PATH_PATTERN.test(instancePath)) {
    throw Object.assign(new Error('Use a valid DataModel path such as game.ServerScriptService.Main.'), { code: 'INVALID_STUDIO_PATH', status: 400 });
  }
  return instancePath;
}

function studioDataModelTypeFrom(url) {
  const type = url.searchParams.get('datamodel_type') ?? 'Edit';
  if (!['Edit', 'Client', 'Server'].includes(type)) {
    throw Object.assign(new Error('Choose the Edit, Client, or Server DataModel.'), { code: 'INVALID_DATAMODEL_TYPE', status: 400 });
  }
  return type;
}

function cameraVectorFrom(url, key) {
  const raw = url.searchParams.get(key);
  if (raw === null || raw === '') return null;
  const values = raw.split(',').map((value) => Number(value.trim()));
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value) || Math.abs(value) > 100000)) {
    throw Object.assign(new Error(`${key} must contain three finite coordinates between -100000 and 100000.`), { code: 'INVALID_CAMERA_VECTOR', status: 400 });
  }
  return values;
}

function knowledgeFiltersFrom(url) {
  for (const key of url.searchParams.keys()) {
    if (!KNOWLEDGE_QUERY_KEYS.has(key)) {
      throw Object.assign(new Error(`The knowledge search does not accept the '${key}' parameter.`), { code: 'INVALID_KNOWLEDGE_FILTER', status: 400 });
    }
  }
  const query = (url.searchParams.get('q') ?? '').trim();
  if (query.length > 120) throw Object.assign(new Error('Knowledge search text must be 120 characters or fewer.'), { code: 'INVALID_KNOWLEDGE_FILTER', status: 400 });

  const kinds = url.searchParams.getAll('kind');
  if (kinds.length > 8 || kinds.some((kind) => !KNOWLEDGE_KINDS.has(kind)) || new Set(kinds).size !== kinds.length) {
    throw Object.assign(new Error('Choose up to eight distinct registered knowledge kinds.'), { code: 'INVALID_KNOWLEDGE_FILTER', status: 400 });
  }

  const parseIds = (key, label) => {
    const values = url.searchParams.getAll(key);
    const pattern = /^[a-z][a-z0-9-]{0,31}\.[a-z0-9][a-z0-9-]{0,79}$/;
    if (values.length > 8 || values.some((value) => !pattern.test(value)) || new Set(values).size !== values.length) {
      throw Object.assign(new Error(`${label} filters must contain up to eight distinct typed record IDs.`), { code: 'INVALID_KNOWLEDGE_FILTER', status: 400 });
    }
    return values;
  };

  const platformState = url.searchParams.get('platform_state') ?? undefined;
  if (platformState !== undefined && !KNOWLEDGE_PLATFORM_STATES.has(platformState)) {
    throw Object.assign(new Error('Choose a recognized Roblox platform state or unknown.'), { code: 'INVALID_KNOWLEDGE_FILTER', status: 400 });
  }
  const maturity = url.searchParams.get('maturity') ?? undefined;
  if (maturity !== undefined && !KNOWLEDGE_MATURITY_LEVELS.has(maturity)) {
    throw Object.assign(new Error('Choose a capability maturity from L1 through L4.'), { code: 'INVALID_KNOWLEDGE_FILTER', status: 400 });
  }
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw Object.assign(new Error('Knowledge result limit must be an integer from 1 to 100.'), { code: 'INVALID_KNOWLEDGE_FILTER', status: 400 });
  }

  return {
    query,
    kinds,
    familyIds: parseIds('family_id', 'Game family'),
    mechanicIds: parseIds('mechanic_id', 'Mechanic'),
    platformState,
    maturity,
    limit,
  };
}

function specialistRequirementsFrom(url) {
  const allowed = new Set(['capability_id', 'input_type', 'output_type', 'limit']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) throw Object.assign(new Error(`Specialist matching does not accept the '${key}' parameter.`), { code: 'SPECIALIST_QUERY_INVALID', status: 400 });
  }
  const parseValues = (key, label) => {
    const values = url.searchParams.getAll(key);
    const pattern = key === 'capability_id'
      ? /^(?:engine|genre|mechanic|style|animation|product|production|failure)\.[a-z0-9]+(?:-[a-z0-9]+)*$/
      : /^[a-z][a-z0-9-]{1,63}$/;
    if (values.length > 20 || values.some((value) => !pattern.test(value)) || new Set(values).size !== values.length) {
      throw Object.assign(new Error(`${label} must contain up to 20 distinct registered identifiers.`), { code: 'SPECIALIST_QUERY_INVALID', status: 400 });
    }
    return values;
  };
  if (url.searchParams.getAll('limit').length > 1) throw Object.assign(new Error('Specify only one specialist result limit.'), { code: 'SPECIALIST_QUERY_INVALID', status: 400 });
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? 40 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw Object.assign(new Error('Specialist result limit must be an integer between 1 and 100.'), { code: 'SPECIALIST_QUERY_INVALID', status: 400 });
  }
  return {
    capabilityIds: parseValues('capability_id', 'Capability filters'),
    inputArtifactTypes: parseValues('input_type', 'Input artifact filters'),
    outputArtifactTypes: parseValues('output_type', 'Output artifact filters'),
    limit,
  };
}

function projectFromQuery(url) {
  for (const key of url.searchParams.keys()) {
    if (key !== 'project') throw Object.assign(new Error(`Task plan routes do not accept the '${key}' query parameter.`), { code: 'TASK_QUERY_INVALID', status: 400 });
  }
  if (url.searchParams.getAll('project').length !== 1) throw Object.assign(new Error('Provide one project query value.'), { code: 'TASK_PROJECT_REQUIRED', status: 400 });
  const project = url.searchParams.get('project');
  if (!project) throw Object.assign(new Error('Select a project to read or update its task plans.'), { code: 'TASK_PROJECT_REQUIRED', status: 400 });
  return validateProjectName(project);
}

function studioReadArgs(tool, url, studioId) {
  const args = { studio_id: studioId };
  if (tool === 'search_game_tree') {
    args.datamodel_type = studioDataModelTypeFrom(url);
    const maxDepth = Number(url.searchParams.get('depth') ?? 4);
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 10) {
      throw Object.assign(new Error('Tree depth must be an integer from 1 to 10.'), { code: 'INVALID_TREE_DEPTH', status: 400 });
    }
    args.max_depth = maxDepth;
    const headLimit = Number(url.searchParams.get('limit') ?? 200);
    if (!Number.isInteger(headLimit) || headLimit < 1 || headLimit > 200) {
      throw Object.assign(new Error('Tree result limit must be an integer from 1 to 200.'), { code: 'INVALID_TREE_LIMIT', status: 400 });
    }
    args.head_limit = headLimit;
    const pathFilter = url.searchParams.get('path');
    if (pathFilter) args.path = studioPathFrom(url);
    const keyword = url.searchParams.get('q');
    if (keyword) {
      if (keyword.length > 100) throw Object.assign(new Error('Search text is too long.'), { code: 'INVALID_SEARCH', status: 400 });
      args.keywords = keyword;
    }
  } else if (tool === 'inspect_instance') {
    args.path = studioPathFrom(url);
  } else if (tool === 'script_read') {
    args.target_file = studioPathFrom(url);
    const startLine = url.searchParams.get('start_line');
    const endLine = url.searchParams.get('end_line');
    if (startLine !== null || endLine !== null) {
      const start = Number(startLine);
      const end = Number(endLine);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end - start > 4999) {
        throw Object.assign(new Error('Script line ranges must use positive integers with at most 5000 lines.'), { code: 'INVALID_SCRIPT_RANGE', status: 400 });
      }
      args.should_read_entire_file = false;
      args.start_line_one_indexed = start;
      args.end_line_one_indexed_inclusive = end;
    }
  } else if (tool === 'screen_capture') {
    args.capture_id = randomUUID();
    const cameraPosition = cameraVectorFrom(url, 'camera_position');
    const lookAtPosition = cameraVectorFrom(url, 'look_at_position');
    if (cameraPosition) args.camera_position = cameraPosition;
    if (lookAtPosition) args.look_at_position = lookAtPosition;
  }
  return args;
}

async function listStudiosAfterConnect(studioClient) {
  const deadline = Date.now() + 2500;
  let instances = await studioClient.listStudios();
  while (!instances.length && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    instances = await studioClient.listStudios();
  }
  return instances;
}

export function createLabServer({ rootDir = REPO_ROOT, toolRootDir = REPO_ROOT, studioClient = new StudioMcpClient(), referenceClient = new RobloxReferenceClient() } = {}) {
  const root = path.resolve(rootDir);
  const toolRoot = path.resolve(toolRootDir);
  const server = createServer(async (request, response) => {
    setSecurityHeaders(response);
    if (!checkHost(request)) return json(response, 403, { error: { code: 'LOCAL_HOST_REQUIRED', message: 'The Lab accepts requests through localhost only.' } });
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !checkOrigin(request)) {
      return json(response, 403, { error: { code: 'SAME_ORIGIN_REQUIRED', message: 'Cross-origin state changes are blocked.' } });
    }

    let url;
    try { url = new URL(request.url, `http://${request.headers.host}`); } catch {
      return json(response, 400, { error: { code: 'INVALID_URL', message: 'The request URL is invalid.' } });
    }
    const route = `${request.method} ${url.pathname}`;

    try {
      if (route === 'GET /api/health') {
        return json(response, 200, { status: 'ok', name: '11vatedTech AI Roblox Studio Lab', startedAt: new Date(server.startedAt).toISOString(), bindAddress: '127.0.0.1' });
      }
      if (route === 'GET /api/environment') {
        return json(response, 200, { environment: collectEnvironmentSnapshot({ cwd: root }) });
      }
      if (route === 'GET /api/overview') {
        const [projects, docs, skills, assets, capabilities, evidence] = await Promise.all([
          listProjects(root),
          readMarkdownIndex(path.join(root, 'docs'), 'docs'),
          readMarkdownIndex(path.join(root, 'skills'), 'skills'),
          walkFiles(path.join(root, 'assets'), { maxFiles: 1000 }),
          loadCapabilityRegister(root),
          loadEvidenceRegistry(root),
        ]);
        return json(response, 200, {
          capturedAt: new Date().toISOString(),
          environment: collectEnvironmentSnapshot({ cwd: root }),
          studio: studioClient.getStatus(),
          projects: { count: projects.length, items: projects },
          library: { documentationFiles: docs.length, specialistWorkflows: skills.length, localAssetFiles: assets.length },
          capabilities: {
            updatedAt: capabilities.updatedAt,
            summary: capabilities.summary,
            openItems: capabilities.capabilities.filter((item) => item.status !== 'VERIFIED').slice(0, 5).map((item) => ({ id: item.id, title: item.title, status: item.status, blockers: item.blockers })),
          },
          evidence: { summary: evidence.summary, updatedAt: evidence.updatedAt },
        });
      }
      if (route === 'GET /api/capabilities') return json(response, 200, await loadCapabilityRegister(root));
      if (route === 'GET /api/evidence') {
        if ([...url.searchParams.keys()].length) throw Object.assign(new Error('The evidence registry does not accept query parameters.'), { code: 'INVALID_EVIDENCE_FILTER', status: 400 });
        return json(response, 200, await loadEvidenceRegistry(root));
      }
      if (route === 'GET /api/projects') return json(response, 200, { projects: await listProjects(root) });
      if (route === 'POST /api/projects') {
        const body = await readJson(request);
        const project = await createProject(root, body.name);
        return json(response, 201, { project });
      }
      const projectRojoRoute = url.pathname.match(/^\/api\/projects\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,47})\/(rojo|build)$/);
      if (projectRojoRoute && request.method === 'GET' && projectRojoRoute[2] === 'rojo') {
        return json(response, 200, await inspectRojoProject(root, toolRoot, projectRojoRoute[1]));
      }
      if (projectRojoRoute && request.method === 'POST' && projectRojoRoute[2] === 'build') {
        const body = await readJson(request);
        if (Object.keys(body).length) throw Object.assign(new Error('Rojo builds use the selected project’s default.project.json and accept no command options.'), { code: 'ROJO_BUILD_OPTIONS_NOT_ALLOWED', status: 400 });
        const result = await buildRojoProject(root, toolRoot, projectRojoRoute[1]);
        if (result.statusCode !== 201) {
          return json(response, result.statusCode, {
            operation: result.operation,
            error: result.operation.failure ?? { code: 'ROJO_BUILD_FAILED', message: result.operation.diagnostics.join(' ') || 'The Rojo build did not complete.' },
          });
        }
        return json(response, 201, { operation: result.operation });
      }
      const buildArtifactRoute = url.pathname.match(/^\/api\/builds\/([a-f0-9-]{36})$/);
      if (buildArtifactRoute && request.method === 'GET') {
        const artifact = await getRojoBuildArtifact(root, buildArtifactRoute[1]);
        const handle = await fs.open(artifact.path, 'r');
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size !== artifact.size) {
          await handle.close();
          throw Object.assign(new Error('The saved place file changed before download.'), { code: 'BUILD_INTEGRITY_FAILED', status: 409 });
        }
        response.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-disposition': `attachment; filename="${artifact.filename}"`,
          'content-length': stat.size,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        });
        handle.createReadStream({ autoClose: true }).on('error', () => response.destroy()).pipe(response);
        return;
      }
      if (route === 'GET /api/docs') return json(response, 200, { documents: await readMarkdownIndex(path.join(root, 'docs'), 'docs') });
      if (route === 'GET /api/skills') return json(response, 200, { skills: await readMarkdownIndex(path.join(root, 'skills'), 'skills') });
      if (route === 'GET /api/knowledge') {
        return json(response, 200, await searchKnowledge(root, knowledgeFiltersFrom(url)));
      }
      if (route === 'GET /api/specialists') {
        return json(response, 200, await matchSpecialists(root, specialistRequirementsFrom(url)));
      }
      if (route === 'POST /api/task-plans') {
        const plan = await createTaskPlan(root, await readJson(request));
        return json(response, 201, { plan });
      }
      if (route === 'GET /api/task-plans') {
        const project = projectFromQuery(url);
        return json(response, 200, { project, plans: await listTaskPlans(root, project) });
      }
      const taskPlanRoute = url.pathname.match(/^\/api\/task-plans\/(task-plan\.[a-z0-9]+(?:-[a-z0-9]+)*)(?:\/tasks\/(task\.[a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(handoff))?)?$/);
      if (taskPlanRoute && request.method === 'GET') {
        const project = projectFromQuery(url);
        const [, planId, taskId, handoff] = taskPlanRoute;
        if (taskId && handoff) return json(response, 200, { handoff: await getTaskHandoff(root, project, planId, taskId) });
        if (!taskId) return json(response, 200, { plan: await readTaskPlan(root, project, planId) });
        return json(response, 404, { error: { code: 'TASK_ROUTE_NOT_FOUND', message: 'Open the task handoff route to read a task contract.' } });
      }
      if (taskPlanRoute && request.method === 'PATCH' && taskPlanRoute[2] && !taskPlanRoute[3]) {
        const project = projectFromQuery(url);
        const [, planId, taskId] = taskPlanRoute;
        const body = await readJson(request);
        return json(response, 200, { plan: await updateTask(root, { ...body, project, planId, taskId }) });
      }
      if (route === 'GET /api/engine/catalog') return json(response, 200, referenceClient.catalog());
      if (route === 'GET /api/engine/class') {
        const className = url.searchParams.get('name');
        const search = url.searchParams.get('q') ?? '';
        return json(response, 200, await referenceClient.getClass(className, search));
      }
      if (route === 'GET /api/library') {
        const kind = url.searchParams.get('kind');
        const roots = { docs: path.join(root, 'docs'), skills: path.join(root, 'skills') };
        const libraryRoot = roots[kind];
        if (!libraryRoot) return json(response, 400, { error: { code: 'INVALID_LIBRARY', message: 'Choose docs or skills.' } });
        const relative = url.searchParams.get('path');
        if (!relative) return json(response, 200, { kind, files: await readMarkdownIndex(libraryRoot, kind) });
        if (!relative.toLowerCase().endsWith('.md')) throw Object.assign(new Error('Only Markdown documents can be opened in this view.'), { code: 'FILE_TYPE_NOT_ALLOWED', status: 415 });
        return json(response, 200, { kind, path: relative.split(/[\\/]+/).join('/'), content: await readExistingTextFile(libraryRoot, relative) });
      }
      if (route === 'GET /api/assets') {
        return json(response, 200, { assets: await walkFiles(path.join(root, 'assets'), { maxFiles: 1000 }) });
      }
      if (route === 'GET /api/captures') return json(response, 200, { captures: await listCaptures(root) });
      if (route === 'POST /api/captures') {
        const body = await readJson(request, MAX_CAPTURE_BODY_BYTES);
        const connection = studioClient.getStatus();
        if (!connection.connected) throw Object.assign(new Error('Connect the official Studio MCP server before saving a viewport capture.'), { code: 'STUDIO_NOT_CONNECTED', status: 409 });
        const instances = await studioClient.listStudios();
        if (!instances.some((instance) => instance.studio_id === body.studioId)) {
          throw Object.assign(new Error('The capture must come from a Studio instance in this session.'), { code: 'STUDIO_INSTANCE_NOT_FOUND', status: 404 });
        }
        if (body.project) await resolveProjectRoot(root, validateProjectName(body.project));
        const capture = await persistStudioCapture(root, { studioId: body.studioId, project: body.project ?? null, framing: body.framing ?? null, result: body.result });
        return json(response, 201, { capture });
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/captures/')) {
        const id = url.pathname.slice('/api/captures/'.length);
        const capture = await readCapture(root, id);
        response.writeHead(200, {
          'content-type': capture.metadata.mimeType,
          'content-length': capture.bytes.length,
          'cache-control': 'private, max-age=31536000, immutable',
          'content-security-policy': "default-src 'none'; sandbox",
          'x-content-type-options': 'nosniff',
          'content-disposition': 'inline',
        });
        return response.end(capture.bytes);
      }
      if (route === 'GET /api/source') {
        const projectName = validateProjectName(url.searchParams.get('project'));
        const projectRoot = await resolveProjectRoot(root, projectName);
        const requestedPath = url.searchParams.get('path');
        if (!requestedPath) return json(response, 200, { project: projectName, files: await walkFiles(projectRoot, { filter: (relative) => ALLOWED_TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase()) }) });
        const filePath = resolveWithin(projectRoot, ...requestedPath.split(/[\\/]+/));
        const extension = path.extname(filePath).toLowerCase();
        if (!ALLOWED_TEXT_EXTENSIONS.has(extension)) throw Object.assign(new Error('Only text source and project metadata files can be opened here.'), { code: 'FILE_TYPE_NOT_ALLOWED', status: 415 });
        const content = await readExistingTextFile(projectRoot, requestedPath);
        return json(response, 200, { project: projectName, path: requestedPath.split(/[\\/]+/).join('/'), content, size: Buffer.byteLength(content) });
      }
      if (route === 'GET /api/quality') {
        const projectName = validateProjectName(url.searchParams.get('project'));
        const projectRoot = await resolveProjectRoot(root, projectName);
        return json(response, 200, { project: projectName, report: await analyzeProject(projectRoot) });
      }
      if (route === 'GET /api/performance') {
        const projectName = validateProjectName(url.searchParams.get('project'));
        const projectRoot = await resolveProjectRoot(root, projectName);
        const report = await analyzeProject(projectRoot);
        return json(response, 200, {
          project: projectName,
          source: { files: report.filesScanned, lines: report.summary.totalLines, bytes: report.summary.totalBytes, largestFiles: report.fileMetrics.toSorted((a, b) => b.bytes - a.bytes).slice(0, 8) },
          runtime: { status: 'unmeasured', detail: 'Frame time, memory, network, and device behavior require a real Studio playtest on target devices.' },
        });
      }
      if (route === 'GET /api/analytics') {
        const projectName = validateProjectName(url.searchParams.get('project'));
        const projectRoot = await resolveProjectRoot(root, projectName);
        const analyticsRoot = resolveWithin(projectRoot, 'analytics');
        return json(response, 200, {
          project: projectName,
          source: 'local_project_files',
          status: 'unmeasured',
          files: await walkFiles(analyticsRoot, { maxFiles: 200, filter: (_relative, name) => /\.(csv|json)$/i.test(name) }),
          detail: 'The Lab lists local analytics artifacts. It does not infer player metrics from source code or collect player data.',
        });
      }
      if (route === 'GET /api/studio') {
        const connection = studioClient.getStatus();
        const toolInventory = studioClient.getToolInventory?.() ?? {
          schemaVersion: 1,
          discoveredAt: null,
          discoveredToolCount: connection.tools?.length ?? 0,
          reportedEntryCount: connection.tools?.length ?? 0,
          truncated: false,
          tools: (connection.tools ?? []).map((name) => ({ name, available: true, operationClass: 'unclassified', dashboardCallable: false, restriction: 'The connected Studio client does not provide tool inventory metadata.', inputSchema: null, inputSchemaStatus: 'not_reported' })),
        };
        return json(response, 200, { connection, toolInventory, launcherInstalled: collectEnvironmentSnapshot({ cwd: root }).robloxStudio.mcpLauncherInstalled });
      }
      if (route === 'POST /api/studio/connect') {
        await readJson(request);
        try {
          const connection = await studioClient.connect();
          const instances = await listStudiosAfterConnect(studioClient);
          return json(response, 200, { connection, instances });
        } catch (error) {
          return json(response, 503, { connection: studioClient.getStatus(), error: safeError(error) });
        }
      }
      if (route === 'POST /api/studio/disconnect') {
        await readJson(request);
        await studioClient.close();
        return json(response, 200, { connection: studioClient.getStatus() });
      }
      if (route === 'GET /api/studio/instances') {
        if (!studioClient.getStatus().connected) return json(response, 409, { error: { code: 'STUDIO_NOT_CONNECTED', message: 'Connect the official Studio MCP server first.' } });
        return json(response, 200, { instances: await studioClient.listStudios() });
      }
      if (route.startsWith('GET /api/studio/')) {
        if (!studioClient.getStatus().connected) return json(response, 409, { error: { code: 'STUDIO_NOT_CONNECTED', message: 'Connect the official Studio MCP server first.' } });
        const studioId = studioIdFrom(url);
        const instances = await studioClient.listStudios();
        if (!instances.some((instance) => instance.studio_id === studioId)) {
          return json(response, 404, { error: { code: 'STUDIO_INSTANCE_NOT_FOUND', message: 'That Studio instance is not in the current session.' } });
        }
        const toolByPath = {
          '/api/studio/state': 'get_studio_state',
          '/api/studio/tree': 'search_game_tree',
          '/api/studio/console': 'get_console_output',
          '/api/studio/inspect': 'inspect_instance',
          '/api/studio/script': 'script_read',
          '/api/studio/capture': 'screen_capture',
        };
        const tool = toolByPath[url.pathname];
        if (!tool) return json(response, 404, { error: { code: 'NOT_FOUND', message: 'The requested Lab route does not exist.' } });
        const result = await studioClient.callReadTool(tool, studioReadArgs(tool, url, studioId));
        return json(response, 200, { studioId, tool, result });
      }

      const staticPaths = new Map([
        ['/', ['index.html', 'text/html; charset=utf-8']],
        ['/app.css', ['app.css', 'text/css; charset=utf-8']],
        ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
        ['/icon.svg', ['icon.svg', 'image/svg+xml']],
      ]);
      if (request.method === 'GET' && staticPaths.has(url.pathname)) {
        const [fileName, contentType] = staticPaths.get(url.pathname);
        const filePath = path.join(DASHBOARD_ROOT, fileName);
        const content = await fs.readFile(filePath);
        response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store', 'content-length': content.length });
        return response.end(content);
      }
      return json(response, 404, { error: { code: 'NOT_FOUND', message: 'The requested Lab route does not exist.' } });
    } catch (error) {
      const pathInputErrors = new Set(['INVALID_PROJECT_NAME', 'INVALID_PATH', 'PATH_OUTSIDE_ROOT']);
      const status = Number.isInteger(error?.status) ? error.status : pathInputErrors.has(error?.code) ? 400 : 500;
      return json(response, status, { error: safeError(error) });
    }
  });
  server.startedAt = Date.now();
  server.on('close', () => { void studioClient.close().catch(() => {}); });
  return server;
}

export { listProjects };
