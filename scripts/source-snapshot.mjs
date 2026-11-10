import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function git(root, args, options = {}) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], ...options });
  } catch (error) {
    const detail = error.stderr?.toString('utf8').trim();
    throw new Error(`Git ${args[0]} failed${detail ? `: ${detail}` : '.'}`);
  }
}

function parseNulSeparated(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

function validateExcludedRoots(excludedRoots) {
  if (!Array.isArray(excludedRoots) || excludedRoots.length > 20) throw new TypeError('excludedRoots must be a bounded array of workspace-relative paths.');
  return excludedRoots.map((value) => {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || value.startsWith('/')
      || value.split('/').some((segment) => !segment || segment === '.' || segment === '..' || /^[a-zA-Z]:/.test(segment))) {
      throw new TypeError('An excluded root is not a safe workspace-relative path.');
    }
    return value.replace(/\/$/, '');
  });
}

function isExcluded(relativePath, roots) {
  return roots.some((root) => relativePath === root || relativePath.startsWith(`${root}/`));
}

function resolveFile(root, relativePath) {
  const target = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Git returned a path outside the workspace: ${relativePath}`);
  }
  return target;
}

export async function captureSourceSnapshot(rootDir, { excludedRoots = ['evidence'] } = {}) {
  const root = path.resolve(rootDir);
  const rootStat = await fs.lstat(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('The source snapshot root must be a real directory.');
  const exclusions = validateExcludedRoots(excludedRoots);
  const commit = git(root, ['rev-parse', '--verify', 'HEAD']).toString('utf8').trim();
  if (!/^[a-f0-9]{40,64}$/i.test(commit)) throw new Error('Git did not return a full commit revision.');
  const branch = git(root, ['branch', '--show-current']).toString('utf8').trim() || null;
  const listedPaths = parseNulSeparated(git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']));
  const deletedPaths = new Set(parseNulSeparated(git(root, ['ls-files', '--deleted', '-z'])));
  const files = [];
  const treeHash = createHash('sha256');

  for (const relativePath of listedPaths.filter((item) => !isExcluded(item, exclusions)).sort()) {
    const fullPath = resolveFile(root, relativePath);
    const stat = await fs.lstat(fullPath).catch((error) => {
      if (error.code === 'ENOENT' && deletedPaths.has(relativePath)) return null;
      throw error;
    });
    if (!stat) continue;
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Source snapshot input must be a regular file: ${relativePath}`);
    const bytes = await fs.readFile(fullPath);
    const fileDigest = createHash('sha256').update(bytes).digest();
    treeHash.update(Buffer.from(relativePath, 'utf8'));
    treeHash.update(Buffer.from([0]));
    treeHash.update(fileDigest);
    treeHash.update(Buffer.from([0]));
    files.push(relativePath);
  }

  const diff = spawnSync('git', ['-C', root, 'diff', '--quiet', 'HEAD', '--', '.', ...exclusions.map((item) => `:(exclude)${item}/**`)], { stdio: 'ignore' });
  if (diff.error) throw new Error(`Could not inspect the source working tree: ${diff.error.message}`);
  if (![0, 1].includes(diff.status)) throw new Error(`Git diff exited with status ${diff.status}.`);
  const untracked = parseNulSeparated(git(root, ['ls-files', '--others', '--exclude-standard', '-z']));
  const hasUntrackedSource = untracked.some((item) => !isExcluded(item, exclusions));

  return {
    branch,
    commit,
    dirty: diff.status === 1 || hasUntrackedSource,
    treeSha256: treeHash.digest('hex'),
    sourceFileCount: files.length,
    excludedRoots: exclusions,
    scope: 'Git-tracked and nonignored workspace files in their current working-tree contents, excluding the listed artifact roots.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const excludedRoots = process.argv[3] ? JSON.parse(process.argv[3]) : ['evidence'];
  captureSourceSnapshot(root, { excludedRoots })
    .then((snapshot) => process.stdout.write(`${JSON.stringify(snapshot)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
