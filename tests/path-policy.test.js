import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveWithin, validateProjectName } from '../src/core/path-policy.js';

test('accepts project slugs that are safe as Windows directory names', () => {
  assert.equal(validateProjectName('moonlit-harbor_2'), 'moonlit-harbor_2');
});

test('rejects traversal, reserved device names, and ambiguous project names', () => {
  for (const name of ['..', '../outside', 'C:\\outside', 'CON', 'name.', 'has space', '']) {
    assert.throws(() => validateProjectName(name), { code: 'INVALID_PROJECT_NAME' }, name);
  }
});

test('resolves nested paths only inside the selected root', () => {
  const root = path.resolve('projects');
  assert.equal(resolveWithin(root, 'demo', 'src', 'Main.server.luau'), path.join(root, 'demo', 'src', 'Main.server.luau'));
  assert.throws(() => resolveWithin(root, '..', 'secrets.txt'), { code: 'PATH_OUTSIDE_ROOT' });
  assert.throws(() => resolveWithin(root, 'C:\\secrets.txt'), { code: 'INVALID_PATH' });
});

test('rejects host-independent rooted, drive-qualified, traversal, and separator-smuggling segments', () => {
  const root = path.resolve('projects');
  for (const segment of [
    'C:\\outside', 'C:outside', '\\\\server\\share', '//server/share',
    '/etc/passwd', '\\rooted', '..\\outside', '../outside',
    'folder/../outside', 'folder\\..\\outside', 'nested/file.luau', 'nested\\file.luau',
  ]) {
    assert.throws(() => resolveWithin(root, segment), (error) => ['INVALID_PATH', 'PATH_OUTSIDE_ROOT'].includes(error.code), segment);
  }
});

test('rejects empty and NUL-containing path segments', () => {
  const root = path.resolve('projects');
  for (const segment of ['', 'safe\0name']) {
    assert.throws(() => resolveWithin(root, segment), { code: 'INVALID_PATH' });
  }
});

test('rejects a path that traverses through a symbolic link when supported', async (t) => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-path-policy-'));
  const linkPath = path.join(temporaryRoot, 'linked');
  const outsidePath = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-path-outside-'));
  try {
    await fs.symlink(outsidePath, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    await fs.rm(outsidePath, { recursive: true, force: true });
    if (['EPERM', 'EACCES', 'ENOTSUP', 'ENOSYS'].includes(error.code)) {
      t.skip(`Host denied creating a test symlink: ${error.code}`);
      return;
    }
    throw error;
  }
  try {
    assert.throws(() => resolveWithin(temporaryRoot, 'linked', 'file.txt'), { code: 'PATH_OUTSIDE_ROOT' });
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    await fs.rm(outsidePath, { recursive: true, force: true });
  }
});
