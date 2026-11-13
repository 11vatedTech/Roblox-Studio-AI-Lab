import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const LABKIT_SOURCE = path.join(REPO_ROOT, 'roblox', 'packages', 'labkit', 'src');
const LABKIT_TEMPLATE_PATH = '../../packages/labkit/src';
const LABKIT_VENDOR_PATH = 'Packages/LabKit';

// Closed set of starter templates. `vendorLabKit` templates reference the in-repo LabKit
// package while they live under roblox/templates/ (so CI builds them in place) and get a
// pinned, hashed copy under Packages/LabKit when scaffolded into projects/.
export const PROJECT_TEMPLATES = Object.freeze({
  base: Object.freeze({
    id: 'base',
    manifestTemplate: 'roblox-base',
    directory: path.join(REPO_ROOT, 'roblox', 'templates', 'base'),
    vendorLabKit: false,
    description: 'Minimal server-authoritative signal loop used to validate the source workflow.',
  }),
  production: Object.freeze({
    id: 'production',
    manifestTemplate: 'roblox-production',
    directory: path.join(REPO_ROOT, 'roblox', 'templates', 'production'),
    vendorLabKit: true,
    description: 'LabKit production core: session-locked saves, economy, upgrade shop, validated remotes, analytics, receipts, themed HUD.',
  }),
});

export function resolveTemplate(templateId = 'base') {
  if (typeof templateId !== 'string' || !Object.hasOwn(PROJECT_TEMPLATES, templateId)) {
    throw Object.assign(new Error(`Unknown project template. Choose one of: ${Object.keys(PROJECT_TEMPLATES).join(', ')}.`), { code: 'INVALID_PROJECT_TEMPLATE', status: 400 });
  }
  return PROJECT_TEMPLATES[templateId];
}

export function listTemplates() {
  return Object.values(PROJECT_TEMPLATES).map(({ id, manifestTemplate, description, vendorLabKit }) => ({ id, manifestTemplate, description, includesLabKit: vendorLabKit }));
}

async function readLabKitVersion() {
  const text = await fs.readFile(path.join(LABKIT_SOURCE, 'init.luau'), 'utf8');
  const match = text.match(/version\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"/);
  if (!match) throw Object.assign(new Error('LabKit init.luau does not declare a semantic version.'), { code: 'LABKIT_VERSION_MISSING', status: 500 });
  return match[1];
}

function rewriteLabKitPath(node) {
  let rewrites = 0;
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$path' && value === LABKIT_TEMPLATE_PATH) {
        node[key] = LABKIT_VENDOR_PATH;
        rewrites += 1;
      } else if (value && typeof value === 'object') {
        rewrites += rewriteLabKitPath(value);
      }
    }
  }
  return rewrites;
}

// Copies LabKit into <projectDir>/Packages/LabKit, repoints default.project.json at the
// vendored copy, and writes Packages/labkit.lock.json with per-file SHA-256 hashes so a
// later upgrade or drift check can compare exact bytes.
export async function vendorLabKit(projectDir) {
  const version = await readLabKitVersion();
  const target = path.join(projectDir, ...LABKIT_VENDOR_PATH.split('/'));
  await fs.mkdir(target, { recursive: true });
  const entries = (await fs.readdir(LABKIT_SOURCE, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.luau')).sort((a, b) => a.name.localeCompare(b.name));
  const files = {};
  for (const entry of entries) {
    const bytes = await fs.readFile(path.join(LABKIT_SOURCE, entry.name));
    await fs.writeFile(path.join(target, entry.name), bytes, { flag: 'wx' });
    files[entry.name] = createHash('sha256').update(bytes).digest('hex');
  }
  const projectFile = path.join(projectDir, 'default.project.json');
  const project = JSON.parse(await fs.readFile(projectFile, 'utf8'));
  const rewrites = rewriteLabKitPath(project.tree);
  if (rewrites !== 1) {
    throw Object.assign(new Error('The template must map LabKit exactly once.'), { code: 'LABKIT_MAPPING_INVALID', status: 500 });
  }
  await fs.writeFile(projectFile, `${JSON.stringify(project, null, 2)}\n`);
  const lock = { package: 'labkit', version, source: 'roblox/packages/labkit/src', vendoredPath: LABKIT_VENDOR_PATH, files };
  await fs.writeFile(path.join(projectDir, 'Packages', 'labkit.lock.json'), `${JSON.stringify(lock, null, 2)}\n`, { flag: 'wx' });
  return lock;
}
