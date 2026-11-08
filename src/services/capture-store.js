import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateProjectName } from '../core/path-policy.js';

const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const MAX_CAPTURE_COUNT = 200;
const MAX_TOTAL_CAPTURE_BYTES = 512 * 1024 * 1024;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORMAT = {
  'image/png': { extension: 'png', check: (data) => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/jpeg': { extension: 'jpg', check: (data) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  'image/webp': { extension: 'webp', check: (data) => data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' },
};

function fail(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function validateId(id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw fail('CAPTURE_NOT_FOUND', 'The requested capture does not exist.', 404);
}

async function getCaptureDirectory(rootDir, { create = false } = {}) {
  const evidenceRoot = path.join(rootDir, 'evidence');
  const captureRoot = path.join(evidenceRoot, 'studio');
  if (create) await fs.mkdir(evidenceRoot, { recursive: true });
  for (const [target, label] of [[evidenceRoot, 'evidence'], [captureRoot, 'Studio evidence']]) {
    try {
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail('CAPTURE_PATH_INVALID', `The ${label} directory must be a local directory.`);
    } catch (error) {
      if (error.code !== 'ENOENT' || !create) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
      await fs.mkdir(target, { recursive: true });
    }
  }
  return captureRoot;
}

function imageFromResult(result) {
  const image = result?.content?.find((block) => block?.type === 'image' && Object.hasOwn(FORMAT, block.mimeType));
  if (!image || typeof image.data !== 'string' || image.data.length > Math.ceil(MAX_CAPTURE_BYTES * 4 / 3) + 8 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data)) {
    throw fail('CAPTURE_IMAGE_INVALID', 'Studio did not return a supported, bounded image block.', 415);
  }
  const bytes = Buffer.from(image.data, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_CAPTURE_BYTES || bytes.toString('base64') !== image.data || !FORMAT[image.mimeType].check(bytes)) {
    throw fail('CAPTURE_IMAGE_INVALID', 'The Studio image data is malformed or exceeds the evidence size limit.', 415);
  }
  return { bytes, mimeType: image.mimeType, extension: FORMAT[image.mimeType].extension };
}

function normalizeFraming(framing) {
  if (framing === undefined || framing === null) return null;
  if (!framing || typeof framing !== 'object' || Array.isArray(framing)) throw fail('CAPTURE_FRAMING_INVALID', 'Capture framing must be a coordinate record.');
  const normalizeVector = (value) => {
    if (value === null || value === undefined) return null;
    if (!Array.isArray(value) || value.length !== 3 || value.some((coordinate) => typeof coordinate !== 'number' || !Number.isFinite(coordinate) || Math.abs(coordinate) > 100000)) {
      throw fail('CAPTURE_FRAMING_INVALID', 'Capture framing coordinates must be three finite numbers between -100000 and 100000.');
    }
    return value;
  };
  return { cameraPosition: normalizeVector(framing.cameraPosition), lookAtPosition: normalizeVector(framing.lookAtPosition) };
}

let captureWriteQueue = Promise.resolve();

async function writeStudioCapture(rootDir, { studioId, project = null, framing = null, result, capturedAt = new Date().toISOString() }) {
  if (typeof studioId !== 'string' || !studioId || studioId.length > 256 || /[\r\n\0]/.test(studioId)) {
    throw fail('STUDIO_ID_REQUIRED', 'A listed Studio instance is required to record evidence.');
  }
  if (project !== null) validateProjectName(project);
  framing = normalizeFraming(framing);
  const timestamp = new Date(capturedAt);
  if (!Number.isFinite(timestamp.getTime())) throw fail('CAPTURE_TIME_INVALID', 'The capture timestamp is invalid.');
  const image = imageFromResult(result);
  const directory = await getCaptureDirectory(rootDir, { create: true });
  const existing = await listCaptures(rootDir, { limit: MAX_CAPTURE_COUNT });
  const existingBytes = existing.reduce((total, capture) => total + capture.bytes, 0);
  if (existing.length >= MAX_CAPTURE_COUNT || existingBytes + image.bytes.length > MAX_TOTAL_CAPTURE_BYTES) {
    throw fail('CAPTURE_QUOTA_REACHED', 'The local viewport evidence archive reached its 200-image or 512 MiB limit. Review and archive evidence before capturing more.', 507);
  }
  const id = randomUUID();
  const imageName = `${id}.${image.extension}`;
  const metadata = {
    schemaVersion: 1,
    id,
    imageName,
    mimeType: image.mimeType,
    bytes: image.bytes.length,
    sha256: createHash('sha256').update(image.bytes).digest('hex'),
    capturedAt: timestamp.toISOString(),
    studioId,
    project,
    framing,
    assessment: { status: 'unreviewed', note: null },
    source: 'Roblox Studio screen_capture MCP tool',
  };
  const imageTemp = path.join(directory, `.${id}.image.tmp`);
  const metadataTemp = path.join(directory, `.${id}.metadata.tmp`);
  try {
    await fs.writeFile(imageTemp, image.bytes, { flag: 'wx' });
    await fs.writeFile(metadataTemp, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
    await fs.rename(imageTemp, path.join(directory, imageName));
    await fs.rename(metadataTemp, path.join(directory, `${id}.json`));
  } catch (error) {
    await Promise.all([fs.rm(imageTemp, { force: true }), fs.rm(metadataTemp, { force: true }), fs.rm(path.join(directory, imageName), { force: true })]);
    throw error;
  }
  return { ...metadata, url: `/api/captures/${id}` };
}

export function persistStudioCapture(rootDir, capture) {
  const pending = captureWriteQueue.then(() => writeStudioCapture(rootDir, capture));
  captureWriteQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

export async function listCaptures(rootDir, { limit = 200 } = {}) {
  const directory = await getCaptureDirectory(rootDir);
  if (!directory) return [];
  const entries = (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.json'))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, Math.min(Math.max(limit, 1), 200));
  const captures = [];
  for (const entry of entries) {
    try {
      const value = JSON.parse(await fs.readFile(path.join(directory, entry.name), 'utf8'));
      validateId(value.id);
      if (entry.name !== `${value.id}.json` || value.imageName !== `${value.id}.${FORMAT[value.mimeType]?.extension}` || !Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_CAPTURE_BYTES || typeof value.capturedAt !== 'string' || typeof value.studioId !== 'string') continue;
      const imagePath = path.join(directory, value.imageName);
      const imageStat = await fs.lstat(imagePath);
      if (imageStat.isSymbolicLink() || !imageStat.isFile() || imageStat.size !== value.bytes) continue;
      captures.push({ assessment: { status: 'unreviewed', note: null }, ...value, url: `/api/captures/${value.id}` });
    } catch { /* Ignore incomplete or invalid evidence records. */ }
  }
  return captures.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
}

export async function readCapture(rootDir, id) {
  validateId(id);
  const directory = await getCaptureDirectory(rootDir);
  if (!directory) throw fail('CAPTURE_NOT_FOUND', 'The requested capture does not exist.', 404);
  const metadataPath = path.join(directory, `${id}.json`);
  try {
    const metadataStat = await fs.lstat(metadataPath);
    if (metadataStat.isSymbolicLink() || !metadataStat.isFile()) throw fail('CAPTURE_NOT_FOUND', 'The requested capture does not exist.', 404);
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    if (metadata.id !== id || metadata.imageName !== `${id}.${FORMAT[metadata.mimeType]?.extension}` || !Number.isInteger(metadata.bytes) || metadata.bytes < 1 || metadata.bytes > MAX_CAPTURE_BYTES) {
      throw fail('CAPTURE_NOT_FOUND', 'The requested capture does not exist.', 404);
    }
    const imagePath = path.join(directory, metadata.imageName);
    const imageStat = await fs.lstat(imagePath);
    if (imageStat.isSymbolicLink() || !imageStat.isFile() || imageStat.size !== metadata.bytes) throw fail('CAPTURE_NOT_FOUND', 'The requested capture does not exist.', 404);
    const bytes = await fs.readFile(imagePath);
    if (createHash('sha256').update(bytes).digest('hex') !== metadata.sha256 || !FORMAT[metadata.mimeType].check(bytes)) throw fail('CAPTURE_NOT_FOUND', 'The requested capture failed its integrity check.', 404);
    return { metadata, bytes };
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) throw fail('CAPTURE_NOT_FOUND', 'The requested capture does not exist.', 404);
    throw error;
  }
}
