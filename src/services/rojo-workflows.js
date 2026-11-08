import { spawn } from 'node:child_process';
import { constants as fsConstants, createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { findExecutable } from '../core/environment.js';
import { resolveWithin, validateProjectName } from '../core/path-policy.js';

const PINNED_ROJO_VERSION = '7.7.1';
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_INPUT_FILES = 10_000;
const MAX_INPUT_BYTES = 512 * 1024 * 1024;
const MAX_INPUT_FILE_BYTES = 128 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const MAX_PROCESS_OUTPUT_BYTES = 256 * 1024;
const BUILD_TIMEOUT_MS = 120_000;
const VERSION_TIMEOUT_MS = 8_000;
const MAX_INPUT_DEPTH = 30;
const activeBuilds = new Set();
const MAX_CONCURRENT_BUILDS = 1;

function fail(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function isNotFound(error) {
  return error?.code === 'ENOENT';
}

async function sha256File(filePath, expectedBytes) {
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.length;
    if (bytes > expectedBytes) throw fail('ROJO_SOURCE_CHANGED', 'A project file changed while its build digest was being computed.', 409);
    digest.update(chunk);
  }
  if (bytes !== expectedBytes) throw fail('ROJO_SOURCE_CHANGED', 'A project file changed while its build digest was being computed.', 409);
  return digest.digest('hex');
}

function safePath(root, segments) {
  try { return resolveWithin(root, ...segments); }
  catch (error) {
    if (error.code === 'PATH_OUTSIDE_ROOT') throw fail('ROJO_MANIFEST_INVALID', 'The project manifest references a path outside its project folder.', 422);
    if (error.code === 'INVALID_PATH') throw fail('ROJO_MANIFEST_INVALID', 'The project manifest contains an unsafe path.', 422);
    throw error;
  }
}

async function ensureDirectoryChain(root, segments, { create = false } = {}) {
  let current = path.resolve(root);
  const rootStat = await fs.lstat(current).catch((error) => { if (isNotFound(error)) return null; throw error; });
  if (rootStat && (rootStat.isSymbolicLink() || !rootStat.isDirectory())) throw fail('LAB_RUNTIME_PATH_INVALID', 'The Lab runtime folder must be a real directory inside the workspace.', 500);
  if (!rootStat && create) await fs.mkdir(current, { recursive: true });
  else if (!rootStat) return null;
  for (const segment of segments) {
    current = resolveWithin(current, segment);
    let stat = await fs.lstat(current).catch((error) => { if (isNotFound(error)) return null; throw error; });
    if (!stat && create) {
      await fs.mkdir(current);
      stat = await fs.lstat(current);
    }
    if (!stat) return null;
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail('LAB_RUNTIME_PATH_INVALID', 'A Lab runtime path component is not a real directory.', 500);
  }
  return current;
}

async function resolveProject(rootDir, projectName) {
  const project = validateProjectName(projectName);
  const projectsRoot = path.join(path.resolve(rootDir), 'projects');
  const projectRoot = resolveWithin(projectsRoot, project);
  for (const directory of [projectsRoot, projectRoot]) {
    const stat = await fs.lstat(directory).catch((error) => { if (isNotFound(error)) return null; throw error; });
    if (!stat) throw fail('PROJECT_NOT_FOUND', `Project ${project} does not exist in projects/.`, 404);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail('PROJECT_PATH_INVALID', 'The selected project must be a real directory inside projects/.', 400);
  }
  return { project, projectRoot };
}

function collectManifestPaths(value, paths = []) {
  if (!value || typeof value !== 'object') return paths;
  if (Array.isArray(value)) {
    for (const item of value) collectManifestPaths(item, paths);
    return paths;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === '$path') {
      if (typeof child !== 'string' || !child.trim()) throw fail('ROJO_MANIFEST_INVALID', 'Every $path value must be a non-empty relative project path.', 422);
      const segments = child.split(/[\\/]/);
      paths.push(segments);
    } else {
      collectManifestPaths(child, paths);
    }
  }
  return paths;
}

async function inspectManifest(rootDir, projectName) {
  const { project, projectRoot } = await resolveProject(rootDir, projectName);
  return inspectProjectManifest(projectRoot, project);
}

async function inspectProjectManifest(projectRoot, project) {
  const manifestPath = path.join(projectRoot, 'default.project.json');
  let stat;
  try { stat = await fs.lstat(manifestPath); }
  catch (error) {
    if (isNotFound(error)) return { project, projectRoot, manifestStatus: 'missing', manifestResult: { status: 'missing', path: `projects/${project}/default.project.json`, diagnostics: ['No default.project.json is present.'] } };
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_MANIFEST_BYTES) {
    return { project, projectRoot, manifestStatus: 'invalid', manifestResult: { status: 'invalid', path: `projects/${project}/default.project.json`, diagnostics: ['The manifest must be a regular file no larger than 1 MiB.'] } };
  }
  let manifest;
  let manifestBytes;
  try {
    manifestBytes = await fs.readFile(manifestPath);
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  }
  catch { return { project, projectRoot, manifestStatus: 'invalid', manifestResult: { status: 'invalid', path: `projects/${project}/default.project.json`, diagnostics: ['The manifest is not valid JSON.'] } }; }
  if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object' || typeof manifest.name !== 'string' || !manifest.name.trim() || !manifest.tree || Array.isArray(manifest.tree) || typeof manifest.tree !== 'object') {
    return { project, projectRoot, manifest, manifestStatus: 'invalid', manifestResult: { status: 'invalid', path: `projects/${project}/default.project.json`, diagnostics: ['A Rojo manifest requires a non-empty name and an object-valued tree.'] } };
  }
  let referencedPaths;
  try { referencedPaths = collectManifestPaths(manifest); }
  catch (error) { return { project, projectRoot, manifest, manifestStatus: 'invalid', manifestResult: { status: 'invalid', path: `projects/${project}/default.project.json`, diagnostics: [error.message] } }; }
  const inputs = new Map();
  const inputBytes = { total: 0 };
  try {
    inputs.set('default.project.json', { filePath: manifestPath, size: stat.size });
    inputBytes.total += stat.size;
    for (const segments of referencedPaths) {
      const target = safePath(projectRoot, segments);
      await collectInputTree(projectRoot, target, segments.join('/'), inputs, inputBytes);
    }
  } catch (error) {
    return { project, projectRoot, manifest, manifestStatus: 'invalid', manifestResult: { status: 'invalid', path: `projects/${project}/default.project.json`, diagnostics: [error.message] } };
  }
  const digest = createHash('sha256');
  for (const [relative, file] of [...inputs.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    digest.update(relative, 'utf8');
    digest.update('\0');
    digest.update(await sha256File(file.filePath, file.size), 'hex');
    digest.update('\0');
  }
  return {
    project,
    projectRoot,
    manifest,
    manifestStatus: 'valid',
    manifestResult: {
      status: 'valid',
      path: `projects/${project}/default.project.json`,
      name: manifest.name,
      referencedPathCount: referencedPaths.length,
      inputFileCount: inputs.size,
      inputBytes: inputBytes.total,
      sourceDigest: digest.digest('hex'),
      diagnostics: [],
    },
    inputFiles: inputs,
    referencedPaths,
    manifestDigest: createHash('sha256').update(manifestBytes).digest('hex'),
  };
}

async function collectInputTree(projectRoot, targetPath, relativePath, inputs, byteCounter) {
  const stat = await fs.lstat(targetPath).catch((error) => { if (isNotFound(error)) throw fail('ROJO_MANIFEST_INVALID', `A manifest input path does not exist: ${relativePath}`, 422); throw error; });
  if (stat.isSymbolicLink()) throw fail('ROJO_MANIFEST_INVALID', `A manifest input cannot traverse a symbolic link: ${relativePath}`, 422);
  if (stat.isDirectory()) {
    const entries = (await fs.readdir(targetPath, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const childSegments = relativePath.split('/').concat(entry.name);
      const childPath = safePath(projectRoot, childSegments);
      await collectInputTree(projectRoot, childPath, childSegments.join('/'), inputs, byteCounter);
    }
    return;
  }
  if (!stat.isFile()) throw fail('ROJO_MANIFEST_INVALID', `A manifest input is not a regular file: ${relativePath}`, 422);
  if (stat.size > MAX_INPUT_FILE_BYTES || byteCounter.total + stat.size > MAX_INPUT_BYTES || inputs.size >= MAX_INPUT_FILES) {
    throw fail('ROJO_INPUT_LIMIT_EXCEEDED', 'Rojo inputs exceed the Lab file-count or size limit.', 413);
  }
  if (!inputs.has(relativePath)) {
    inputs.set(relativePath, { filePath: targetPath, size: stat.size });
    byteCounter.total += stat.size;
  }
}

async function ensureSnapshotDirectory(snapshotRoot, segments) {
  let current = snapshotRoot;
  for (const segment of segments) {
    current = resolveWithin(current, segment);
    const stat = await fs.lstat(current).catch((error) => { if (isNotFound(error)) return null; throw error; });
    if (!stat) await fs.mkdir(current);
    else if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail('ROJO_SNAPSHOT_INVALID', 'A Lab build snapshot contains an unexpected path.', 500);
  }
  return current;
}

async function copyInputToSnapshot(sourceRoot, snapshotRoot, segments, state, depth = 0) {
  if (depth > MAX_INPUT_DEPTH) throw fail('ROJO_INPUT_LIMIT_EXCEEDED', 'Rojo inputs exceed the Lab directory-depth limit.', 413);
  const sourcePath = safePath(sourceRoot, segments);
  const destinationPath = resolveWithin(snapshotRoot, ...segments);
  const stat = await fs.lstat(sourcePath).catch((error) => { if (isNotFound(error)) throw fail('ROJO_SOURCE_CHANGED', `A project input disappeared while the build snapshot was created: ${segments.join('/')}`, 409); throw error; });
  if (stat.isSymbolicLink()) throw fail('ROJO_MANIFEST_INVALID', `A manifest input cannot traverse a symbolic link: ${segments.join('/')}`, 422);
  const realSourcePath = await fs.realpath(sourcePath);
  const realSourceRoot = await fs.realpath(sourceRoot);
  const relativeRealPath = path.relative(realSourceRoot, realSourcePath);
  if (!relativeRealPath || relativeRealPath === '..' || relativeRealPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeRealPath)) {
    throw fail('ROJO_MANIFEST_INVALID', 'A project input resolved outside the selected project folder.', 422);
  }
  if (stat.isDirectory()) {
    await ensureSnapshotDirectory(snapshotRoot, segments);
    const entries = (await fs.readdir(sourcePath, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) await copyInputToSnapshot(sourceRoot, snapshotRoot, [...segments, entry.name], state, depth + 1);
    const after = await fs.lstat(sourcePath);
    if (after.isSymbolicLink() || after.mtimeMs !== stat.mtimeMs) throw fail('ROJO_SOURCE_CHANGED', `A project folder changed while the build snapshot was created: ${segments.join('/')}`, 409);
    return;
  }
  if (!stat.isFile()) throw fail('ROJO_MANIFEST_INVALID', `A manifest input is not a regular file: ${segments.join('/')}`, 422);
  const relativePath = segments.join('/');
  if (state.seenFiles.has(relativePath)) return;
  if (stat.size > MAX_INPUT_FILE_BYTES || state.bytes + stat.size > MAX_INPUT_BYTES || state.files >= MAX_INPUT_FILES) {
    throw fail('ROJO_INPUT_LIMIT_EXCEEDED', 'Rojo inputs exceed the Lab file-count or size limit.', 413);
  }
  await ensureSnapshotDirectory(snapshotRoot, segments.slice(0, -1));
  await fs.copyFile(sourcePath, destinationPath, fsConstants.COPYFILE_EXCL);
  const after = await fs.lstat(sourcePath);
  const copied = await fs.lstat(destinationPath);
  if (after.isSymbolicLink() || after.size !== stat.size || copied.size !== stat.size || after.mtimeMs !== stat.mtimeMs) {
    throw fail('ROJO_SOURCE_CHANGED', `A project file changed while the build snapshot was created: ${segments.join('/')}`, 409);
  }
  state.bytes += copied.size;
  state.files += 1;
  state.seenFiles.add(relativePath);
}

async function createBuildSnapshot(rootDir, project, projectRoot, id, manifestInfo) {
  const stagingRoot = await ensureDirectoryChain(path.resolve(rootDir), ['.lab-runtime', 'staging'], { create: true });
  const snapshotRoot = resolveWithin(stagingRoot, id);
  await fs.mkdir(snapshotRoot);
  try {
    const sourceManifest = resolveWithin(projectRoot, 'default.project.json');
    const snapshotManifest = resolveWithin(snapshotRoot, 'default.project.json');
    await fs.copyFile(sourceManifest, snapshotManifest, fsConstants.COPYFILE_EXCL);
    const copiedManifestBytes = await fs.readFile(snapshotManifest);
    if (createHash('sha256').update(copiedManifestBytes).digest('hex') !== manifestInfo.manifestDigest) {
      throw fail('ROJO_SOURCE_CHANGED', 'The project manifest changed while the build snapshot was created.', 409);
    }
    const snapshotManifestValue = JSON.parse(copiedManifestBytes.toString('utf8'));
    const snapshotPaths = collectManifestPaths(snapshotManifestValue);
    if (JSON.stringify(snapshotPaths) !== JSON.stringify(manifestInfo.referencedPaths)) {
      throw fail('ROJO_SOURCE_CHANGED', 'The project manifest changed while the build snapshot was created.', 409);
    }
    const state = { bytes: copiedManifestBytes.length, files: 1, seenFiles: new Set(['default.project.json']) };
    const copiedTargets = new Set();
    for (const segments of snapshotPaths) {
      const key = segments.join('/');
      if (copiedTargets.has(key)) continue;
      copiedTargets.add(key);
      await copyInputToSnapshot(projectRoot, snapshotRoot, segments, state);
    }
    const snapshot = await inspectProjectManifest(snapshotRoot, project);
    if (snapshot.manifestStatus !== 'valid') throw fail('ROJO_SNAPSHOT_INVALID', snapshot.manifestResult.diagnostics.join(' '), 500);
    return { snapshotRoot, sourceDigest: snapshot.manifestResult.sourceDigest, inputBytes: snapshot.manifestResult.inputBytes };
  } catch (error) {
    await fs.rm(snapshotRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function resolveRojoExecutable(toolRootDir) {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const pinnedCandidate = path.join(path.resolve(toolRootDir), '.tools', `rojo-${PINNED_ROJO_VERSION}`, `rojo${suffix}`);
  const localStat = await fs.lstat(pinnedCandidate).catch((error) => { if (isNotFound(error)) return null; throw error; });
  if (localStat && localStat.isFile() && !localStat.isSymbolicLink()) return pinnedCandidate;
  const fromPath = findExecutable('rojo');
  return fromPath;
}

function runProcess(executable, args, cwd, timeoutMs, outputLimit, outputFilePath = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = { stdout: '', stderr: '', bytes: 0 };
    let timedOut = false;
    let outputExceeded = false;
    let artifactExceeded = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const outputMonitor = outputFilePath ? setInterval(async () => {
      try {
        const stat = await fs.stat(outputFilePath);
        if (stat.size > MAX_OUTPUT_BYTES) {
          artifactExceeded = true;
          child.kill();
        }
      } catch { /* Rojo has not created the output yet. */ }
    }, 250) : null;
    outputMonitor?.unref();
    const capture = (field) => (chunk) => {
      output.bytes += chunk.length;
      if (output.bytes > outputLimit) {
        outputExceeded = true;
        child.kill();
        return;
      }
      output[field] += chunk.toString('utf8');
    };
    child.stdout.on('data', capture('stdout'));
    child.stderr.on('data', capture('stderr'));
    child.once('error', (error) => {
      clearTimeout(timer);
      if (outputMonitor) clearInterval(outputMonitor);
      reject(fail('ROJO_EXECUTION_FAILED', `Rojo could not start: ${error.message}`, 503));
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (outputMonitor) clearInterval(outputMonitor);
      if (timedOut) return reject(fail('ROJO_BUILD_TIMEOUT', 'Rojo exceeded the 120 second build time limit.', 504));
      if (outputExceeded) return reject(fail('ROJO_OUTPUT_LIMIT_EXCEEDED', 'Rojo emitted more than the Lab output limit.', 413));
      if (artifactExceeded) return reject(fail('ROJO_OUTPUT_LIMIT_EXCEEDED', 'The built place exceeded the 512 MiB Lab output limit.', 413));
      if (code !== 0) {
        const detail = (output.stderr || output.stdout || `Process exited with ${signal ?? code}.`).trim().slice(0, 1000);
        return reject(Object.assign(fail('ROJO_BUILD_FAILED', `Rojo build failed: ${detail}`, 422), { stdout: output.stdout, stderr: output.stderr }));
      }
      resolve({ stdout: output.stdout.trim(), stderr: output.stderr.trim() });
    });
  });
}

async function toolInfo(toolRootDir) {
  const executable = await resolveRojoExecutable(toolRootDir);
  if (!executable) return { executable: null, available: false, version: null, diagnostics: ['Rojo is not installed.'] };
  const stat = await fs.lstat(executable).catch(() => null);
  if (!stat || !stat.isFile()) return { executable: null, available: false, version: null, diagnostics: ['The Rojo executable is not a regular file.'] };
  try {
    const result = await runProcess(executable, ['--version'], toolRootDir, VERSION_TIMEOUT_MS, 8192);
    const match = `${result.stdout} ${result.stderr}`.match(/\b(\d+\.\d+\.\d+)\b/);
    const version = match?.[1] ?? null;
    if (version !== PINNED_ROJO_VERSION) return { executable, available: false, version, diagnostics: [`Rojo ${PINNED_ROJO_VERSION} is required; found ${version ?? 'an unrecognized version'}.`] };
    return { executable, available: true, version, diagnostics: [] };
  } catch (error) {
    return { executable, available: false, version: null, diagnostics: [error.message] };
  }
}

async function writeOperation(rootDir, operation) {
  const operationsDir = await ensureDirectoryChain(path.resolve(rootDir), ['.lab-runtime', 'operations', 'rojo-builds'], { create: true });
  const destination = resolveWithin(operationsDir, `${operation.id}.json`);
  const temporary = resolveWithin(operationsDir, `.${operation.id}.tmp`);
  await fs.writeFile(temporary, `${JSON.stringify(operation, null, 2)}\n`, { flag: 'wx' });
  await fs.rename(temporary, destination);
}

export async function listRojoBuilds(rootDir, projectName) {
  const project = validateProjectName(projectName);
  const operationsDir = await ensureDirectoryChain(path.resolve(rootDir), ['.lab-runtime', 'operations', 'rojo-builds']);
  if (!operationsDir) return [];
  const entries = await fs.readdir(operationsDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && !entry.isSymbolicLink() && /^[a-f0-9-]{36}\.json$/.test(entry.name));
  if (files.length > 5000) throw fail('ROJO_OPERATION_HISTORY_LIMIT', 'The Lab has more than 5,000 Rojo build records. Archive the local runtime history before requesting the list.', 413);
  const candidates = [];
  for (const entry of files) {
    const recordPath = resolveWithin(operationsDir, entry.name);
    const stat = await fs.lstat(recordPath);
    if (!stat.isSymbolicLink() && stat.isFile() && stat.size <= 128 * 1024) candidates.push({ recordPath, modifiedAt: stat.mtimeMs });
  }
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt || left.recordPath.localeCompare(right.recordPath));
  const builds = [];
  for (const candidate of candidates.slice(0, 100)) {
    let operation;
    try { operation = JSON.parse(await fs.readFile(candidate.recordPath, 'utf8')); }
    catch { continue; }
    if (operation.kind !== 'rojo-build' || operation.project !== project) continue;
    builds.push({
      id: operation.id,
      project: operation.project,
      status: operation.status,
      startedAt: operation.startedAt,
      completedAt: operation.completedAt,
      durationMs: operation.durationMs,
      rojoVersion: operation.rojoVersion,
      sourceDigest: operation.sourceDigest,
      output: operation.output,
      downloadUrl: operation.downloadUrl,
      failure: operation.failure ?? null,
    });
    if (builds.length >= 20) break;
  }
  return builds;
}

export async function inspectRojoProject(rootDir, toolRootDir, projectName) {
  const [project, tool, builds] = await Promise.all([
    inspectManifest(rootDir, projectName),
    toolInfo(toolRootDir),
    listRojoBuilds(rootDir, projectName),
  ]);
  const manifest = project.manifestResult;
  const build = builds[0] ?? { status: 'not_run', detail: 'No build has been run through the Lab project workflow.' };
  return {
    project: project.project,
    rojo: { available: tool.available, version: tool.version, requiredVersion: PINNED_ROJO_VERSION, diagnostics: tool.diagnostics },
    manifest,
    build,
    recentBuilds: builds,
  };
}

export async function buildRojoProject(rootDir, toolRootDir, projectName) {
  const { project, projectRoot } = await resolveProject(rootDir, projectName);
  if (activeBuilds.has(project)) throw fail('ROJO_BUILD_BUSY', 'A Rojo build for this project is already running.', 409);
  if (activeBuilds.size >= MAX_CONCURRENT_BUILDS) throw fail('ROJO_BUILD_BUSY', 'The Lab already has the maximum number of concurrent Rojo builds.', 429);
  activeBuilds.add(project);
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  const startedClock = Date.now();
  const operation = {
    schemaVersion: 1,
    id,
    kind: 'rojo-build',
    project,
    status: 'failed',
    startedAt,
    completedAt: null,
    durationMs: null,
    command: 'rojo build default.project.json --output <Lab-managed project artifact>',
    manifestPath: `projects/${project}/default.project.json`,
    sourceDigest: null,
    rojoVersion: null,
    inputBytes: null,
    output: null,
    stdout: '',
    stderr: '',
    diagnostics: [],
    failure: null,
    downloadUrl: null,
  };
  let statusCode = 422;
  let snapshotRoot = null;
  let outputPath = null;
  try {
    const manifestInfo = await inspectProjectManifest(projectRoot, project);
    if (manifestInfo.manifestStatus !== 'valid') {
      const message = manifestInfo.manifestResult.diagnostics.join(' ');
      operation.diagnostics.push(message);
      operation.failure = { code: manifestInfo.manifestStatus === 'missing' ? 'ROJO_MANIFEST_MISSING' : 'ROJO_MANIFEST_INVALID', message };
    } else {
      const tool = await toolInfo(toolRootDir);
      if (!tool.available) {
        const message = tool.diagnostics.join(' ');
        operation.diagnostics.push(message);
        operation.failure = { code: 'ROJO_UNAVAILABLE', message };
        operation.rojoVersion = tool.version;
        statusCode = 503;
      } else {
        operation.rojoVersion = tool.version;
        const snapshot = await createBuildSnapshot(rootDir, project, projectRoot, id, manifestInfo);
        snapshotRoot = snapshot.snapshotRoot;
        operation.sourceDigest = snapshot.sourceDigest;
        operation.inputBytes = snapshot.inputBytes;
        const runtimeRoot = path.resolve(rootDir);
        const outputDirectory = await ensureDirectoryChain(runtimeRoot, ['.lab-runtime', 'builds', project], { create: true });
        outputPath = resolveWithin(outputDirectory, `${id}.rbxlx`);
        const childArgs = ['build', 'default.project.json', '--output', outputPath];
        const run = await runProcess(tool.executable, childArgs, snapshotRoot, BUILD_TIMEOUT_MS, MAX_PROCESS_OUTPUT_BYTES, outputPath);
        const outputStat = await fs.lstat(outputPath).catch((error) => { if (isNotFound(error)) return null; throw error; });
        if (!outputStat || outputStat.isSymbolicLink() || !outputStat.isFile() || outputStat.size < 1) throw fail('ROJO_OUTPUT_MISSING', 'Rojo exited successfully but did not produce a regular place file.', 500);
        if (outputStat.size > MAX_OUTPUT_BYTES) throw fail('ROJO_OUTPUT_LIMIT_EXCEEDED', 'The built place exceeded the 512 MiB Lab output limit.', 413);
        const outputSha256 = await sha256File(outputPath, outputStat.size);
        operation.status = 'passed';
        operation.output = {
          path: `.lab-runtime/builds/${project}/${id}.rbxlx`,
          bytes: outputStat.size,
          sha256: outputSha256,
        };
        operation.stdout = run.stdout.slice(0, 64 * 1024);
        operation.stderr = run.stderr.slice(0, 64 * 1024);
        operation.downloadUrl = `/api/builds/${id}`;
        statusCode = 201;
      }
    }
  } catch (error) {
    operation.diagnostics.push(error.message.slice(0, 1000));
    operation.failure = { code: typeof error.code === 'string' ? error.code : 'ROJO_BUILD_FAILED', message: error.message.slice(0, 1000) };
    if (typeof error.stdout === 'string') operation.stdout = error.stdout.slice(0, 64 * 1024);
    if (typeof error.stderr === 'string') operation.stderr = error.stderr.slice(0, 64 * 1024);
    statusCode = Number.isInteger(error.status) ? error.status : 422;
    if (outputPath) {
      const partial = await fs.lstat(outputPath).catch((statError) => { if (isNotFound(statError)) return null; throw statError; });
      if (partial?.isFile() && !partial.isSymbolicLink()) await fs.rm(outputPath, { force: true });
    }
  } finally {
    if (snapshotRoot) await fs.rm(snapshotRoot, { recursive: true, force: true }).catch(() => {});
    activeBuilds.delete(project);
    operation.completedAt = new Date().toISOString();
    operation.durationMs = Date.now() - startedClock;
    await writeOperation(rootDir, operation);
  }
  return { operation, statusCode };
}

export async function getRojoBuildArtifact(rootDir, id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw fail('BUILD_NOT_FOUND', 'That Lab build artifact does not exist.', 404);
  const operationsDir = await ensureDirectoryChain(path.resolve(rootDir), ['.lab-runtime', 'operations', 'rojo-builds']);
  if (!operationsDir) throw fail('BUILD_NOT_FOUND', 'That Lab build artifact does not exist.', 404);
  const recordPath = resolveWithin(operationsDir, `${id}.json`);
  let operation;
  try {
    const stat = await fs.lstat(recordPath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 1024 * 1024) throw fail('BUILD_NOT_FOUND', 'That Lab build artifact does not exist.', 404);
    const contents = await fs.readFile(recordPath, 'utf8');
    try { operation = JSON.parse(contents); }
    catch { throw fail('BUILD_NOT_FOUND', 'That Lab build artifact does not exist.', 404); }
  } catch (error) {
    if (isNotFound(error)) throw fail('BUILD_NOT_FOUND', 'That Lab build artifact does not exist.', 404);
    throw error;
  }
  if (operation.id !== id || operation.kind !== 'rojo-build' || operation.status !== 'passed' || !operation.output) throw fail('BUILD_NOT_FOUND', 'That Lab build artifact does not exist.', 404);
  const project = validateProjectName(operation.project);
  const expectedRelativePath = `.lab-runtime/builds/${project}/${id}.rbxlx`;
  if (operation.output.path !== expectedRelativePath) throw fail('BUILD_NOT_FOUND', 'That Lab build artifact does not exist.', 404);
  const buildsDirectory = await ensureDirectoryChain(path.resolve(rootDir), ['.lab-runtime', 'builds', project]);
  if (!buildsDirectory) throw fail('BUILD_NOT_FOUND', 'That Lab build artifact does not exist.', 404);
  const outputPath = resolveWithin(buildsDirectory, `${id}.rbxlx`);
  let outputStat;
  try { outputStat = await fs.lstat(outputPath); }
  catch (error) { if (isNotFound(error)) throw fail('BUILD_NOT_FOUND', 'That Lab build artifact does not exist.', 404); throw error; }
  if (outputStat.isSymbolicLink() || !outputStat.isFile() || outputStat.size !== operation.output.bytes || outputStat.size > MAX_OUTPUT_BYTES) throw fail('BUILD_NOT_FOUND', 'That Lab build artifact does not exist.', 404);
  if (await sha256File(outputPath, outputStat.size) !== operation.output.sha256) throw fail('BUILD_INTEGRITY_FAILED', 'The saved place file no longer matches its build record.', 409);
  return { path: outputPath, size: outputStat.size, filename: `${project}-${id}.rbxlx` };
}
