import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveWithin, validateProjectName } from '../core/path-policy.js';

export const PROJECT_MANIFEST_SCHEMA_VERSION = 1;
const MANIFEST_NAME = 'lab.project.json';
const MAX_MANIFEST_BYTES = 64 * 1024;
const STAGING_MIN_AGE_MS = 30_000;
const MAX_SOURCE_FILES = 5_000;
const DEFAULT_SETTINGS = Object.freeze({ maxPlayers: 8, targetDevice: 'all', genre: '', notes: '' });
const SETTING_VALIDATORS = new Map([
  ['maxPlayers', (value) => Number.isInteger(value) && value >= 1 && value <= 100],
  ['targetDevice', (value) => ['desktop', 'mobile', 'console', 'all'].includes(value)],
  ['genre', (value) => typeof value === 'string' && value.length <= 80],
  ['notes', (value) => typeof value === 'string' && value.length <= 500],
]);
const REQUIRED_STRUCTURE = Object.freeze([
  { path: 'default.project.json', kind: 'file' },
  { path: 'src/server', kind: 'directory' },
  { path: 'src/client', kind: 'directory' },
  { path: 'src/shared', kind: 'directory' },
]);

function fail(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

async function lstatOrNull(target) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

async function assertRealDirectory(target, code, message) {
  const stat = await lstatOrNull(target);
  if (!stat) return false;
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail(code, message);
  return true;
}

export async function resolveProjectDirectory(rootDir, name) {
  const project = validateProjectName(name);
  const projectsRoot = path.join(path.resolve(rootDir), 'projects');
  await assertRealDirectory(projectsRoot, 'PROJECT_ROOT_INVALID', 'The projects folder must be a real directory inside the Lab workspace.');
  let projectRoot;
  try {
    projectRoot = resolveWithin(projectsRoot, project);
  } catch (error) {
    if (error.code === 'PATH_OUTSIDE_ROOT' || error.code === 'INVALID_PATH') {
      throw fail('PROJECT_PATH_INVALID', 'The selected project must be a real local directory inside projects/.');
    }
    throw error;
  }
  const stat = await lstatOrNull(projectRoot);
  if (!stat) throw fail('PROJECT_NOT_FOUND', `Project ${project} does not exist in projects/.`, 404);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw fail('PROJECT_PATH_INVALID', 'The selected project must be a real local directory inside projects/.');
  }
  return { project, projectsRoot, projectRoot };
}

export async function readProjectManifest(projectRoot, { expectedName } = {}) {
  const manifestPath = path.join(projectRoot, MANIFEST_NAME);
  const stat = await lstatOrNull(manifestPath);
  if (!stat) {
    return { status: 'missing', manifest: null, diagnostics: ['No lab.project.json is present for this project.'] };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return { status: 'invalid', manifest: null, diagnostics: ['The project manifest must be a regular file, not a link or directory.'] };
  }
  if (stat.size > MAX_MANIFEST_BYTES) {
    return { status: 'invalid', manifest: null, diagnostics: ['The project manifest exceeds the 64 KiB limit.'] };
  }
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    return { status: 'invalid', manifest: null, diagnostics: ['The project manifest is not valid JSON.'] };
  }
  if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object') {
    return { status: 'invalid', manifest: null, diagnostics: ['The project manifest must be a JSON object.'] };
  }
  if (expectedName !== undefined && manifest.name !== undefined && manifest.name !== expectedName) {
    return { status: 'invalid', manifest: null, diagnostics: ['The project manifest name does not match its directory.'] };
  }
  if (manifest.schemaVersion === undefined) {
    return { status: 'ok', manifest, legacy: true, diagnostics: ['This manifest predates the persistent project schema; recovery can rebuild it with an identity.'] };
  }
  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) {
    return { status: 'invalid', manifest: null, diagnostics: ['The project manifest schemaVersion must be a positive integer.'] };
  }
  if (manifest.schemaVersion > PROJECT_MANIFEST_SCHEMA_VERSION) {
    return {
      status: 'incompatible',
      manifest: null,
      diagnostics: [`This project uses manifest schemaVersion ${manifest.schemaVersion}; this Lab supports ${PROJECT_MANIFEST_SCHEMA_VERSION}.`],
    };
  }
  if (manifest.projectId !== undefined && typeof manifest.projectId !== 'string') {
    return { status: 'invalid', manifest: null, diagnostics: ['The project identity must be a string when present.'] };
  }
  if (manifest.revision !== undefined && (!Number.isInteger(manifest.revision) || manifest.revision < 1)) {
    return { status: 'invalid', manifest: null, diagnostics: ['The project revision must be a positive integer when present.'] };
  }
  return { status: 'ok', manifest, legacy: false, diagnostics: [] };
}

async function inspectStructure(projectRoot) {
  const issues = [];
  for (const entry of REQUIRED_STRUCTURE) {
    const target = resolveWithin(projectRoot, ...entry.path.split('/'));
    const stat = await lstatOrNull(target);
    if (!stat) {
      issues.push({ path: entry.path, code: 'MISSING', message: `Required ${entry.kind} ${entry.path} is missing.` });
      continue;
    }
    if (stat.isSymbolicLink()) {
      issues.push({ path: entry.path, code: 'SYMLINK', message: `${entry.path} must not be a symbolic link.` });
      continue;
    }
    if (entry.kind === 'file' && !stat.isFile()) issues.push({ path: entry.path, code: 'NOT_A_FILE', message: `${entry.path} must be a regular file.` });
    if (entry.kind === 'directory' && !stat.isDirectory()) issues.push({ path: entry.path, code: 'NOT_A_DIRECTORY', message: `${entry.path} must be a directory.` });
  }
  return { ok: issues.length === 0, issues };
}

async function findInterruptedStaging(projectsRoot, project) {
  const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
  const escaped = project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\.${escaped}\\.staging-\\d+-\\d+$`);
  const staging = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !pattern.test(entry.name)) continue;
    const target = resolveWithin(projectsRoot, entry.name);
    const stat = await lstatOrNull(target);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) continue;
    staging.push({ name: entry.name, path: `projects/${entry.name}`, ageMs: Date.now() - stat.mtimeMs });
  }
  return staging.sort((a, b) => b.ageMs - a.ageMs);
}

async function countSourceFiles(projectRoot) {
  let count = 0;
  async function walk(current, depth) {
    if (depth > 10 || count >= MAX_SOURCE_FILES) return;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (count >= MAX_SOURCE_FILES) return;
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(path.join(current, entry.name), depth + 1);
      else if (entry.isFile() && /\.(?:lua|luau)$/i.test(entry.name)) count += 1;
    }
  }
  await walk(projectRoot, 0);
  return count;
}

function publicManifest(manifest) {
  if (!manifest) return null;
  return {
    schemaVersion: manifest.schemaVersion ?? null,
    projectId: manifest.projectId ?? null,
    name: manifest.name ?? null,
    displayName: manifest.displayName ?? manifest.name ?? null,
    template: manifest.template ?? null,
    createdAt: manifest.createdAt ?? null,
    updatedAt: manifest.updatedAt ?? null,
    revision: manifest.revision ?? null,
    settings: manifest.settings && typeof manifest.settings === 'object' ? manifest.settings : { ...DEFAULT_SETTINGS },
    recoveredAt: manifest.recoveredAt ?? null,
    recoveredFrom: manifest.recoveredFrom ?? null,
  };
}

function classifyState({ manifestStatus, structure, staging, legacy }) {
  if (manifestStatus === 'invalid') return 'corrupted';
  if (manifestStatus === 'incompatible') return 'incompatible';
  if (!structure.ok) return 'incomplete';
  if (manifestStatus === 'missing') return 'unregistered';
  if (staging.length) return 'interrupted';
  return legacy ? 'legacy' : 'ready';
}

function nextActionsFor(state, { manifestStatus, structure, staging, legacy }) {
  const actions = [];
  if (state === 'corrupted') actions.push('Rebuild the manifest with POST /api/projects/<slug>/recover to preserve the unreadable bytes and issue a new identity.');
  if (state === 'incompatible') actions.push('Upgrade the Lab; recovery will not downgrade a newer manifest schema.');
  if (state === 'unregistered') actions.push('Rebuild the manifest with POST /api/projects/<slug>/recover.');
  if (state === 'interrupted') actions.push(`Remove ${staging.length} stale staging director${staging.length === 1 ? 'y' : 'ies'} with POST /api/projects/<slug>/recover.`);
  if (state === 'incomplete') actions.push(`Restore the missing project structure: ${structure.issues.map((issue) => issue.path).join(', ')}.`);
  if (state === 'legacy' && manifestStatus === 'ok' && legacy) actions.push('Optionally rebuild the legacy manifest to add a persistent identity and settings.');
  if (state === 'ready' && staging.length) actions.push('Stale staging output is present and can be removed.');
  return actions;
}

export async function inspectProject(rootDir, name) {
  const { project, projectsRoot, projectRoot } = await resolveProjectDirectory(rootDir, name);
  const manifestRead = await readProjectManifest(projectRoot, { expectedName: project });
  const [structure, staging, sourceFiles] = await Promise.all([
    inspectStructure(projectRoot),
    findInterruptedStaging(projectsRoot, project),
    countSourceFiles(projectRoot),
  ]);
  const state = classifyState({ manifestStatus: manifestRead.status, structure, staging, legacy: manifestRead.legacy });
  const manifest = manifestRead.status === 'ok' ? publicManifest(manifestRead.manifest) : null;
  return {
    name: project,
    path: `projects/${project}`,
    state,
    manifestStatus: manifestRead.status,
    legacy: Boolean(manifestRead.legacy),
    manifest,
    structure,
    sourceFiles,
    interruptedOperations: staging,
    diagnostics: [...manifestRead.diagnostics, ...structure.issues.map((issue) => issue.message)],
    nextActions: nextActionsFor(state, { manifestStatus: manifestRead.status, structure, staging, legacy: manifestRead.legacy }),
    inspectedAt: new Date().toISOString(),
  };
}

export async function createProjectManifest(projectDir, { name, displayName, projectId = randomUUID(), recoveredFrom = null } = {}) {
  const project = validateProjectName(name);
  if (displayName !== undefined && (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 80)) {
    throw fail('INVALID_DISPLAY_NAME', 'A display name must be 1–80 characters when provided.');
  }
  const now = new Date().toISOString();
  const manifest = {
    schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
    projectId,
    name: project,
    displayName: displayName?.trim() || project,
    template: 'roblox-base',
    createdAt: now,
    updatedAt: now,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
  };
  if (recoveredFrom) {
    manifest.recoveredAt = now;
    manifest.recoveredFrom = recoveredFrom;
  }
  await fs.writeFile(path.join(projectDir, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifest;
}

function validateSettingsPatch(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw fail('INVALID_PROJECT_SETTINGS', 'Project settings must be a JSON object.');
  }
  const keys = Object.keys(settings);
  if (keys.length === 0) throw fail('INVALID_PROJECT_SETTINGS', 'Provide at least one project setting to update.');
  for (const key of keys) {
    const validator = SETTING_VALIDATORS.get(key);
    if (!validator) throw fail('INVALID_PROJECT_SETTINGS', `Unknown project setting '${key}'.`);
    if (!validator(settings[key])) throw fail('INVALID_PROJECT_SETTINGS', `Setting '${key}' has an unsupported value.`);
  }
}

export async function updateProjectSettings(rootDir, name, { expectedRevision, settings } = {}) {
  const { project, projectRoot } = await resolveProjectDirectory(rootDir, name);
  const manifestRead = await readProjectManifest(projectRoot, { expectedName: project });
  if (manifestRead.status !== 'ok') {
    throw fail('PROJECT_MANIFEST_NOT_READY', `Project ${project} has no usable manifest (${manifestRead.status}); recover it before updating settings.`, 409);
  }
  const current = manifestRead.manifest;
  if (current.schemaVersion === undefined) {
    throw fail('PROJECT_MANIFEST_NOT_READY', `Project ${project} uses a legacy manifest; rebuild it before updating settings.`, 409);
  }
  if (expectedRevision !== undefined) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw fail('INVALID_PROJECT_REVISION', 'expectedRevision must be a positive integer.');
    }
    if (expectedRevision !== current.revision) {
      throw fail('PROJECT_REVISION_CONFLICT', `Project ${project} is at revision ${current.revision}, not ${expectedRevision}.`, 409);
    }
  }
  validateSettingsPatch(settings);
  const currentSettings = current.settings && typeof current.settings === 'object' && !Array.isArray(current.settings) ? current.settings : {};
  const next = {
    ...current,
    settings: { ...DEFAULT_SETTINGS, ...currentSettings, ...settings },
    revision: (Number.isInteger(current.revision) ? current.revision : 1) + 1,
    updatedAt: new Date().toISOString(),
  };
  const tempPath = path.join(projectRoot, `.${MANIFEST_NAME}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' });
    await fs.rename(tempPath, path.join(projectRoot, MANIFEST_NAME));
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return inspectProject(rootDir, project);
}

export async function recoverProject(rootDir, name, { actions } = {}) {
  const allowed = new Set(['remove-staging', 'rebuild-manifest']);
  if (!Array.isArray(actions) || actions.length === 0 || new Set(actions).size !== actions.length) {
    throw fail('INVALID_RECOVERY_ACTIONS', 'Provide one or more distinct recovery actions.');
  }
  for (const action of actions) {
    if (!allowed.has(action)) throw fail('INVALID_RECOVERY_ACTIONS', `Unknown recovery action '${action}'.`);
  }
  const { project, projectsRoot, projectRoot } = await resolveProjectDirectory(rootDir, name);
  const results = [];
  const preserved = [];
  const staging = await findInterruptedStaging(projectsRoot, project);

  if (actions.includes('remove-staging')) {
    if (staging.length === 0) results.push({ action: 'remove-staging', status: 'noop', detail: 'No staging directories were present.' });
    for (const entry of staging) {
      if (entry.ageMs < STAGING_MIN_AGE_MS) {
        throw fail('PROJECT_OPERATION_IN_PROGRESS', `Staging directory ${entry.path} was modified in the last 30 seconds; a project operation may still be running.`, 409);
      }
      await fs.rm(path.join(projectsRoot, entry.name), { recursive: true, force: true });
      results.push({ action: 'remove-staging', status: 'removed', path: entry.path });
    }
  }

  if (actions.includes('rebuild-manifest')) {
    const manifestRead = await readProjectManifest(projectRoot, { expectedName: project });
    if (manifestRead.status === 'ok' && !manifestRead.legacy) {
      throw fail('PROJECT_MANIFEST_ALREADY_VALID', `Project ${project} already has a usable manifest.`, 409);
    }
    if (manifestRead.status === 'incompatible') {
      throw fail('PROJECT_SCHEMA_UNSUPPORTED', `Project ${project} uses a newer manifest schema and will not be downgraded.`, 409);
    }
    const manifestPath = path.join(projectRoot, MANIFEST_NAME);
    const existing = await lstatOrNull(manifestPath);
    if (existing && existing.isFile() && !existing.isSymbolicLink()) {
      const bytes = await fs.readFile(manifestPath);
      if (bytes.length <= MAX_MANIFEST_BYTES) {
        const backupName = `${MANIFEST_NAME}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
        await fs.writeFile(path.join(projectRoot, backupName), bytes, { flag: 'wx' });
        preserved.push(`projects/${project}/${backupName}`);
      }
    }
    await fs.rm(manifestPath, { force: true });
    const manifest = await createProjectManifest(projectRoot, {
      name: project,
      displayName: manifestRead.manifest?.displayName ?? undefined,
      recoveredFrom: manifestRead.status === 'missing' ? 'missing' : 'invalid',
    });
    results.push({ action: 'rebuild-manifest', status: 'rebuilt', projectId: manifest.projectId, revision: manifest.revision });
  }

  return { project: await inspectProject(rootDir, project), actions: results, preserved };
}
