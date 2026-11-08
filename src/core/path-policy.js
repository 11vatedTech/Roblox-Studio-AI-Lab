import fs from 'node:fs';
import path from 'node:path';

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function validateProjectName(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw Object.assign(new Error('Project names must be non-empty slugs with no surrounding spaces.'), { code: 'INVALID_PROJECT_NAME' });
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(value) || WINDOWS_RESERVED_NAME.test(value)) {
    throw Object.assign(new Error('Use 1–48 letters, numbers, hyphens, or underscores; the first character must be a letter or number.'), { code: 'INVALID_PROJECT_NAME' });
  }
  return value;
}

export function resolveWithin(root, ...segments) {
  const base = path.resolve(root);
  if (segments.some((segment) => typeof segment !== 'string' || segment.length === 0 || segment.includes('\0'))) {
    throw Object.assign(new Error('Path segments must be non-empty strings without NUL bytes.'), { code: 'INVALID_PATH' });
  }
  if (segments.some((segment) => segment === '..')) {
    throw Object.assign(new Error('The requested path is outside its allowed root.'), { code: 'PATH_OUTSIDE_ROOT' });
  }
  const hasUnsafeSyntax = segments.some((segment) => (
    segment === '.'
    || /[\\/]/.test(segment)
    || /^[a-zA-Z]:/.test(segment)
    || /^[\\/]/.test(segment)
  ));
  if (hasUnsafeSyntax) {
    throw Object.assign(new Error('Path segments must be single relative components without separators or drive prefixes.'), { code: 'INVALID_PATH' });
  }
  const target = path.resolve(base, ...segments);
  const relative = path.relative(base, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw Object.assign(new Error('The requested path is outside its allowed root.'), { code: 'PATH_OUTSIDE_ROOT' });
  }
  let candidate = base;
  const candidates = [base];
  for (const segment of segments) {
    candidate = path.join(candidate, segment);
    candidates.push(candidate);
  }
  for (const current of candidates) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw Object.assign(new Error('The requested path traverses a symbolic link.'), { code: 'PATH_OUTSIDE_ROOT' });
      }
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') break;
      throw error;
    }
  }
  return target;
}
