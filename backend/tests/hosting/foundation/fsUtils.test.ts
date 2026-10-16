import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getDirectorySizeBytes, resolveSandboxedPath } from '../../../src/services/hostingFsUtils';

describe('hostingFsUtils', () => {
  let root: string;
  let outside: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sahary-root-'));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sahary-outside-'));
    await fs.mkdir(path.join(root, 'sub', 'deep'), { recursive: true });
    await fs.writeFile(path.join(root, 'index.html'), '<h1>x</h1>');
    await fs.writeFile(path.join(root, 'sub', 'deep', 'a.txt'), 'aaa');
    await fs.writeFile(path.join(outside, 'secret.txt'), 'top secret');
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  describe('resolveSandboxedPath', () => {
    test('resolves a simple relative path inside the root', async () => {
      const resolved = await resolveSandboxedPath(root, 'sub/deep/a.txt');
      expect(resolved).toBe(path.join(await fs.realpath(root), 'sub', 'deep', 'a.txt'));
    });

    test('treats a leading slash as root-relative', async () => {
      const resolved = await resolveSandboxedPath(root, '/sub/deep');
      expect(resolved).toBe(path.join(await fs.realpath(root), 'sub', 'deep'));
    });

    test('resolves the root itself for empty and slash input', async () => {
      const realRoot = await fs.realpath(root);
      expect(await resolveSandboxedPath(root, '')).toBe(realRoot);
      expect(await resolveSandboxedPath(root, '/')).toBe(realRoot);
    });

    test('allows non-existing paths inside the root', async () => {
      const resolved = await resolveSandboxedPath(root, 'new/dir/file.txt');
      expect(resolved).toBe(path.join(await fs.realpath(root), 'new', 'dir', 'file.txt'));
    });

    test('rejects .. segments that escape the root', async () => {
      await expect(resolveSandboxedPath(root, '..')).rejects.toMatchObject({ status: 400 });
      await expect(resolveSandboxedPath(root, '../outside')).rejects.toMatchObject({ status: 400 });
      await expect(resolveSandboxedPath(root, 'sub/../../outside')).rejects.toMatchObject({ status: 400 });
    });

    test('allows .. segments that stay inside the root', async () => {
      const resolved = await resolveSandboxedPath(root, 'sub/../index.html');
      expect(resolved).toBe(path.join(await fs.realpath(root), 'index.html'));
    });

    test('rejects NUL bytes', async () => {
      await expect(resolveSandboxedPath(root, `a${String.fromCharCode(0)}b`)).rejects.toMatchObject({ status: 400 });
    });

    test('rejects backslash-based escapes', async () => {
      await expect(resolveSandboxedPath(root, 'sub\\..\\..\\outside')).rejects.toMatchObject({ status: 400 });
      await expect(resolveSandboxedPath(root, 'sub\\deep')).rejects.toMatchObject({ status: 400 });
    });

    test('rejects drive letters and UNC paths', async () => {
      await expect(resolveSandboxedPath(root, 'C:\\Windows\\system32')).rejects.toMatchObject({ status: 400 });
      await expect(resolveSandboxedPath(root, 'C:/Windows/system32')).rejects.toMatchObject({ status: 400 });
      await expect(resolveSandboxedPath(root, '\\\\server\\share')).rejects.toMatchObject({ status: 400 });
      await expect(resolveSandboxedPath(root, '//server/share')).rejects.toMatchObject({ status: 400 });
      await expect(resolveSandboxedPath(root, '/c:/Windows')).rejects.toMatchObject({ status: 400 });
    });

    test('rejects a symlinked directory that escapes the root', async () => {
      const link = path.join(root, 'escape-link');
      try {
        await fs.symlink(outside, link, 'dir');
      } catch {
        // Symlink creation requires privileges on Windows — skip when unavailable.
        return;
      }
      await expect(resolveSandboxedPath(root, 'escape-link/secret.txt')).rejects.toMatchObject({ status: 400 });
    });

    test('rejects a final-component symlink pointing outside the root', async () => {
      const link = path.join(root, 'last-link.txt');
      try {
        await fs.symlink(path.join(outside, 'secret.txt'), link, 'file');
      } catch {
        return;
      }
      await expect(resolveSandboxedPath(root, 'last-link.txt')).rejects.toMatchObject({ status: 400 });
    });

    test('keeps a symlink that stays inside the root', async () => {
      const link = path.join(root, 'inside-link');
      try {
        await fs.symlink(path.join(root, 'sub'), link, 'dir');
      } catch {
        return;
      }
      const resolved = await resolveSandboxedPath(root, 'inside-link/deep/a.txt');
      expect(resolved).toContain('inside-link');
    });
  });

  describe('getDirectorySizeBytes', () => {
    test('sums file sizes recursively', async () => {
      const expected = Buffer.byteLength('<h1>x</h1>') + Buffer.byteLength('aaa');
      expect(await getDirectorySizeBytes(root)).toBeGreaterThanOrEqual(expected);
    });

    test('returns 0 for a missing directory', async () => {
      expect(await getDirectorySizeBytes(path.join(root, 'does-not-exist'))).toBe(0);
    });

    test('counts symlinks as 0 bytes', async () => {
      const linkDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sahary-links-'));
      try {
        await fs.symlink(path.join(outside, 'secret.txt'), path.join(linkDir, 'l.txt'), 'file');
      } catch {
        await fs.rm(linkDir, { recursive: true, force: true });
        return;
      }
      try {
        expect(await getDirectorySizeBytes(linkDir)).toBe(0);
      } finally {
        await fs.rm(linkDir, { recursive: true, force: true });
      }
    });

    test('throws when maxEntries is exceeded', async () => {
      await expect(getDirectorySizeBytes(root, { maxEntries: 1 })).rejects.toMatchObject({ status: 500 });
    });
  });
});
