import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import * as fm from '../../src/services/fileManagerService';
import type { FileManagerAccount } from '../../src/services/fileManagerService';

/**
 * Service-level tests against real temp directories. Every operation must
 * refuse sandbox escapes (.., backslashes, drive letters, NULs, absolute
 * paths, symlinks pointing out of the root) before touching the filesystem.
 */

let root: string;
let outside: string;
let account: FileManagerAccount;
let seq = 0;

const newAccount = async (diskQuota = 5): Promise<FileManagerAccount> => {
  seq += 1;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `sahary-wp04-acc${seq}-`));
  return { id: `acc-${process.pid}-${seq}`, documentRoot: dir, diskQuota };
};

beforeAll(async () => {
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sahary-wp04-outside-'));
  await fs.writeFile(path.join(outside, 'secret.txt'), 'top secret');
});

afterAll(async () => {
  await fs.rm(outside, { recursive: true, force: true });
});

beforeEach(async () => {
  account = await newAccount();
  root = account.documentRoot as string;
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const seedTree = async (): Promise<void> => {
  await fs.mkdir(path.join(root, 'bdir', 'deep'), { recursive: true });
  await fs.mkdir(path.join(root, 'adir'));
  await fs.writeFile(path.join(root, 'z.txt'), 'zzz');
  await fs.writeFile(path.join(root, 'a.txt'), 'aaa');
  await fs.writeFile(path.join(root, 'page.html'), '<h1>hi</h1>');
  await fs.writeFile(path.join(root, 'bdir', 'deep', 'n.txt'), 'nested');
};

const ATTACK_PATHS = [
  '..',
  '../secret.txt',
  'sub/../../secret.txt',
  'a\\..\\..\\secret.txt',
  'C:/Windows/system32',
  '//server/share',
  '/c:/Windows',
  `a${String.fromCharCode(0)}b`,
];

const makeTmpUpload = async (name: string, content: string): Promise<{ tmpPath: string; name: string }> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sahary-wp04-up-'));
  const tmpPath = path.join(dir, `staged-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await fs.writeFile(tmpPath, content);
  return { tmpPath, name };
};

describe('sandbox enforcement on every operation', () => {
  test.each(ATTACK_PATHS)('list(%s) rejects with 400', async (p) => {
    await expect(fm.list(account, p)).rejects.toMatchObject({ status: 400 });
  });

  test.each(ATTACK_PATHS)('mkdir(%s) rejects with 400', async (p) => {
    await expect(fm.mkdir(account, p, 'newdir')).rejects.toMatchObject({ status: 400 });
  });

  test.each(ATTACK_PATHS)('rename from=%s rejects with 400', async (p) => {
    await expect(fm.rename(account, p, 'x.txt')).rejects.toMatchObject({ status: 400 });
  });

  test.each(ATTACK_PATHS)('rename to=%s rejects with 400', async (p) => {
    await fs.writeFile(path.join(root, 'src.txt'), 'x');
    await expect(fm.rename(account, 'src.txt', p)).rejects.toMatchObject({ status: 400 });
  });

  test.each(ATTACK_PATHS)('remove(%s) rejects with 400', async (p) => {
    await expect(fm.remove(account, [p])).rejects.toMatchObject({ status: 400 });
  });

  test.each(ATTACK_PATHS)('openDownload(%s) rejects with 400', async (p) => {
    await expect(fm.openDownload(account, p)).rejects.toMatchObject({ status: 400 });
  });

  test.each(ATTACK_PATHS)('readText(%s) rejects with 400', async (p) => {
    await expect(fm.readText(account, p)).rejects.toMatchObject({ status: 400 });
  });

  test.each(ATTACK_PATHS)('writeText(%s) rejects with 400', async (p) => {
    await expect(fm.writeText(account, p, 'content')).rejects.toMatchObject({ status: 400 });
  });

  test.each(ATTACK_PATHS)('saveUploads(%s) rejects with 400', async (p) => {
    const f = await makeTmpUpload('ok.txt', 'x');
    await expect(fm.saveUploads(account, p, [f], { overwrite: false })).rejects.toMatchObject({ status: 400 });
  });

  test('operations on a symlinked dir escaping the root are rejected', async () => {
    let link: string | null = path.join(root, 'escape');
    try {
      await fs.symlink(outside, link, 'dir');
    } catch {
      link = null; // no symlink privilege on this host — skip
    }
    if (!link) {
      return;
    }
    await expect(fm.list(account, 'escape')).rejects.toMatchObject({ status: 400 });
    await expect(fm.readText(account, 'escape/secret.txt')).rejects.toMatchObject({ status: 400 });
    await expect(fm.writeText(account, 'escape/new.txt', 'x')).rejects.toMatchObject({ status: 400 });
    await expect(fm.openDownload(account, 'escape/secret.txt')).rejects.toMatchObject({ status: 400 });
    await expect(fm.mkdir(account, 'escape', 'd')).rejects.toMatchObject({ status: 400 });
    const f = await makeTmpUpload('x.txt', 'x');
    await expect(fm.saveUploads(account, 'escape', [f], { overwrite: false })).rejects.toMatchObject({ status: 400 });
    await expect(fm.remove(account, ['escape/secret.txt'])).rejects.toMatchObject({ status: 400 });
    await expect(fm.rename(account, 'a.txt', 'escape/a.txt')).rejects.toMatchObject({ status: 400 });
    // the outside file is untouched
    await expect(fs.readFile(path.join(outside, 'secret.txt'), 'utf8')).resolves.toBe('top secret');
  });

  test('final-component symlink to an outside file is rejected', async () => {
    const link = path.join(root, 'link.txt');
    try {
      await fs.symlink(path.join(outside, 'secret.txt'), link, 'file');
    } catch {
      return;
    }
    await expect(fm.readText(account, 'link.txt')).rejects.toMatchObject({ status: 400 });
    await expect(fm.openDownload(account, 'link.txt')).rejects.toMatchObject({ status: 400 });
  });
});

describe('list', () => {
  test('lists directories first then files by name, with mime and DTO shape', async () => {
    await seedTree();
    const res = await fm.list(account, '/');
    expect(res.path).toBe('/');
    expect(res.parent).toBeNull();
    expect(res.truncated).toBe(false);
    expect(res.entries.map((e) => e.name)).toEqual(['adir', 'bdir', 'a.txt', 'page.html', 'z.txt']);
    const html = res.entries.find((e) => e.name === 'page.html');
    expect(html).toMatchObject({ type: 'file', mime: 'text/html', path: '/page.html' });
    const dir = res.entries.find((e) => e.name === 'adir');
    expect(dir).toMatchObject({ type: 'directory', size: 0, mime: null });
    const txt = res.entries.find((e) => e.name === 'a.txt');
    expect(txt?.size).toBe(3);
    expect(typeof txt?.modifiedAt).toBe('string');
  });

  test('subdir listing reports normalized path and parent', async () => {
    await seedTree();
    const res = await fm.list(account, '/bdir/deep');
    expect(res.path).toBe('/bdir/deep');
    expect(res.parent).toBe('/bdir');
    expect(res.entries.map((e) => e.path)).toEqual(['/bdir/deep/n.txt']);
  });

  test('truncates at maxEntries', async () => {
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(root, `f${i}.txt`), 'x');
    }
    const res = await fm.list(account, '/', { maxEntries: 4 });
    expect(res.truncated).toBe(true);
    expect(res.entries).toHaveLength(4);
  });

  test('unknown extension gets null mime', async () => {
    await fs.writeFile(path.join(root, 'blob.zzz9'), 'x');
    const res = await fm.list(account, '/');
    expect(res.entries[0].mime).toBeNull();
  });

  test('404 on missing dir, 400 on listing a file', async () => {
    await seedTree();
    await expect(fm.list(account, '/nope')).rejects.toMatchObject({ status: 404 });
    await expect(fm.list(account, '/a.txt')).rejects.toMatchObject({ status: 400 });
  });
});

describe('mkdir', () => {
  test('creates a directory and returns its FileEntryDTO', async () => {
    const entry = await fm.mkdir(account, '/', 'newdir');
    expect(entry).toMatchObject({ name: 'newdir', path: '/newdir', type: 'directory' });
    const st = await fs.stat(path.join(root, 'newdir'));
    expect(st.isDirectory()).toBe(true);
  });

  test('mkdir inside the account root is allowed', async () => {
    const entry = await fm.mkdir(account, '', 'atroot');
    expect(entry.path).toBe('/atroot');
  });

  test('409 when the name already exists', async () => {
    await fm.mkdir(account, '/', 'dup');
    await expect(fm.mkdir(account, '/', 'dup')).rejects.toMatchObject({ status: 409 });
  });

  test('404 when the parent directory does not exist', async () => {
    await expect(fm.mkdir(account, '/missing', 'd')).rejects.toMatchObject({ status: 404 });
  });

  test.each(['a/b', 'a\\b', '..', '.', 'a:b', 'a?b', 'a*b', 'a<b', 'a>b', 'a|b', 'a"b', `x${String.fromCharCode(7)}y`])(
    '400 for invalid name %j',
    async (name) => {
      await expect(fm.mkdir(account, '/', name)).rejects.toMatchObject({ status: 400 });
    },
  );

  test('400 for a name longer than 255 bytes', async () => {
    await expect(fm.mkdir(account, '/', 'x'.repeat(256))).rejects.toMatchObject({ status: 400 });
    // 255 bytes of a multibyte char count as bytes, not chars
    await expect(fm.mkdir(account, '/', 'é'.repeat(128))).rejects.toMatchObject({ status: 400 });
  });
});

describe('rename / move', () => {
  test('renames a file and returns the new entry', async () => {
    await fs.writeFile(path.join(root, 'old.txt'), 'data');
    const entry = await fm.rename(account, 'old.txt', 'new.txt');
    expect(entry).toMatchObject({ name: 'new.txt', path: '/new.txt', type: 'file' });
    await expect(fs.readFile(path.join(root, 'new.txt'), 'utf8')).resolves.toBe('data');
    await expect(fs.stat(path.join(root, 'old.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('moves a file into a subdirectory', async () => {
    await fs.mkdir(path.join(root, 'sub'));
    await fs.writeFile(path.join(root, 'f.txt'), 'x');
    const entry = await fm.rename(account, 'f.txt', 'sub/f.txt');
    expect(entry.path).toBe('/sub/f.txt');
    await expect(fs.readFile(path.join(root, 'sub', 'f.txt'), 'utf8')).resolves.toBe('x');
  });

  test('moves a directory', async () => {
    await fs.mkdir(path.join(root, 'd'));
    await fs.writeFile(path.join(root, 'd', 'inner.txt'), 'i');
    await fm.rename(account, 'd', 'renamed');
    await expect(fs.readFile(path.join(root, 'renamed', 'inner.txt'), 'utf8')).resolves.toBe('i');
  });

  test('409 when the destination exists — never overwrites', async () => {
    await fs.writeFile(path.join(root, 'a.txt'), 'a');
    await fs.writeFile(path.join(root, 'b.txt'), 'b');
    await expect(fm.rename(account, 'a.txt', 'b.txt')).rejects.toMatchObject({ status: 409 });
    await expect(fs.readFile(path.join(root, 'b.txt'), 'utf8')).resolves.toBe('b');
  });

  test('refuses to move a directory into itself', async () => {
    await fs.mkdir(path.join(root, 'd', 'inner'), { recursive: true });
    await expect(fm.rename(account, 'd', 'd/inner/moved')).rejects.toMatchObject({ status: 400 });
  });

  test('refuses to touch the account root', async () => {
    await fs.writeFile(path.join(root, 'a.txt'), 'a');
    await expect(fm.rename(account, '/', 'x')).rejects.toMatchObject({ status: 400 });
    await expect(fm.rename(account, 'a.txt', '/')).rejects.toMatchObject({ status: 400 });
  });

  test('404 for a missing source and missing destination parent', async () => {
    await expect(fm.rename(account, 'gone.txt', 'x.txt')).rejects.toMatchObject({ status: 404 });
    await fs.writeFile(path.join(root, 'a.txt'), 'a');
    await expect(fm.rename(account, 'a.txt', 'missing/dir/x.txt')).rejects.toMatchObject({ status: 404 });
  });

  test('400 for an invalid destination name', async () => {
    await fs.writeFile(path.join(root, 'a.txt'), 'a');
    await expect(fm.rename(account, 'a.txt', 'sub/a:b.txt')).rejects.toMatchObject({ status: 400 });
  });
});

describe('remove', () => {
  test('deletes a file and reports the count', async () => {
    await fs.writeFile(path.join(root, 'a.txt'), 'a');
    await expect(fm.remove(account, ['a.txt'])).resolves.toEqual({ deleted: 1 });
    await expect(fs.stat(path.join(root, 'a.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('deletes a directory tree recursively', async () => {
    await fs.mkdir(path.join(root, 'd', 'inner'), { recursive: true });
    await fs.writeFile(path.join(root, 'd', 'inner', 'f.txt'), 'x');
    await expect(fm.remove(account, ['d'])).resolves.toEqual({ deleted: 1 });
    await expect(fs.stat(path.join(root, 'd'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('deletes multiple paths', async () => {
    await fs.writeFile(path.join(root, 'a.txt'), 'a');
    await fs.writeFile(path.join(root, 'b.txt'), 'b');
    await fs.mkdir(path.join(root, 'd'));
    await expect(fm.remove(account, ['a.txt', 'b.txt', 'd'])).resolves.toEqual({ deleted: 3 });
  });

  test('400 when the account root is targeted', async () => {
    await expect(fm.remove(account, ['/'])).rejects.toMatchObject({ status: 400 });
    await expect(fm.remove(account, [''])).rejects.toMatchObject({ status: 400 });
    await expect(fs.stat(root)).resolves.toBeTruthy();
  });

  test('404 on a missing path and nothing else is deleted', async () => {
    await fs.writeFile(path.join(root, 'keep.txt'), 'k');
    await expect(fm.remove(account, ['keep.txt', 'missing.txt'])).rejects.toMatchObject({ status: 404 });
    await expect(fs.readFile(path.join(root, 'keep.txt'), 'utf8')).resolves.toBe('k');
  });

  test('400 for empty array and for more than 100 paths', async () => {
    await expect(fm.remove(account, [])).rejects.toMatchObject({ status: 400 });
    await expect(fm.remove(account, Array(101).fill('x.txt'))).rejects.toMatchObject({ status: 400 });
  });
});

describe('openDownload', () => {
  test('returns the absolute path, name and size for a file', async () => {
    await fs.writeFile(path.join(root, 'f.txt'), 'hello');
    const target = await fm.openDownload(account, '/f.txt');
    expect(target.name).toBe('f.txt');
    expect(target.size).toBe(5);
    expect(target.absPath).toBe(path.join(await fs.realpath(root), 'f.txt'));
  });

  test('400 for a directory, 404 for missing', async () => {
    await fs.mkdir(path.join(root, 'd'));
    await expect(fm.openDownload(account, '/d')).rejects.toMatchObject({ status: 400 });
    await expect(fm.openDownload(account, '/nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('readText', () => {
  test('returns normalized path, content and size', async () => {
    await fs.mkdir(path.join(root, 'sub'));
    await fs.writeFile(path.join(root, 'sub', 'f.txt'), 'hello world');
    const res = await fm.readText(account, '/sub/f.txt');
    expect(res).toEqual({ path: '/sub/f.txt', content: 'hello world', size: 11 });
  });

  test('413 when the file exceeds the text edit limit', async () => {
    process.env.HOSTING_TEXT_EDIT_MAX_KB = '1';
    try {
      await fs.writeFile(path.join(root, 'big.txt'), 'x'.repeat(2048));
      await expect(fm.readText(account, 'big.txt')).rejects.toMatchObject({ status: 413 });
    } finally {
      delete process.env.HOSTING_TEXT_EDIT_MAX_KB;
    }
  });

  test('415 when a NUL byte appears in the first 8 KB', async () => {
    const buf = Buffer.concat([Buffer.from('text '), Buffer.from([0]), Buffer.from('more')]);
    await fs.writeFile(path.join(root, 'bin.dat'), buf);
    await expect(fm.readText(account, 'bin.dat')).rejects.toMatchObject({ status: 415 });
  });

  test('400 for a directory, 404 for missing', async () => {
    await fs.mkdir(path.join(root, 'd'));
    await expect(fm.readText(account, '/d')).rejects.toMatchObject({ status: 400 });
    await expect(fm.readText(account, '/nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('writeText', () => {
  test('creates a new file with byte-exact content', async () => {
    const html = '<!doctype html><script>alert(1)</script><p>café</p>';
    const entry = await fm.writeText(account, '/index.html', html);
    expect(entry).toMatchObject({ name: 'index.html', path: '/index.html', type: 'file' });
    await expect(fs.readFile(path.join(root, 'index.html'), 'utf8')).resolves.toBe(html);
  });

  test('overwrites an existing file atomically (no temp files left)', async () => {
    await fs.writeFile(path.join(root, 'f.txt'), 'old');
    await fm.writeText(account, 'f.txt', 'new content');
    await expect(fs.readFile(path.join(root, 'f.txt'), 'utf8')).resolves.toBe('new content');
    const names = await fs.readdir(root);
    expect(names.filter((n) => n.startsWith('.sahary-write-'))).toEqual([]);
  });

  test('404 when the parent directory is missing', async () => {
    await expect(fm.writeText(account, '/missing/f.txt', 'x')).rejects.toMatchObject({ status: 404 });
  });

  test('400 writing to a directory or the root', async () => {
    await fs.mkdir(path.join(root, 'd'));
    await expect(fm.writeText(account, '/d', 'x')).rejects.toMatchObject({ status: 400 });
    await expect(fm.writeText(account, '/', 'x')).rejects.toMatchObject({ status: 400 });
  });

  test('413 when the size delta would exceed the plan quota', async () => {
    const tiny = await newAccount(0); // 0 GB quota
    try {
      await expect(fm.writeText(tiny, '/f.txt', 'some bytes')).rejects.toMatchObject({ status: 413 });
      await expect(fs.stat(path.join(tiny.documentRoot as string, 'f.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await fs.rm(tiny.documentRoot as string, { recursive: true, force: true });
    }
  });
});

describe('saveUploads', () => {
  test('moves staged files in and reports name+size', async () => {
    const a = await makeTmpUpload('a.txt', 'aaa');
    const b = await makeTmpUpload('b.txt', 'bbbbb');
    const res = await fm.saveUploads(account, '/', [a, b], { overwrite: false });
    expect(res.uploaded).toEqual([
      { name: 'a.txt', size: 3 },
      { name: 'b.txt', size: 5 },
    ]);
    await expect(fs.readFile(path.join(root, 'a.txt'), 'utf8')).resolves.toBe('aaa');
    // staged temp files are consumed by the move
    await expect(fs.stat(a.tmpPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('409 on existing name without overwrite, and earlier files are not moved', async () => {
    await fs.writeFile(path.join(root, 'exists.txt'), 'original');
    const ok = await makeTmpUpload('ok.txt', 'ok');
    const clash = await makeTmpUpload('exists.txt', 'replacement');
    await expect(fm.saveUploads(account, '/', [ok, clash], { overwrite: false })).rejects.toMatchObject({ status: 409 });
    await expect(fs.readFile(path.join(root, 'exists.txt'), 'utf8')).resolves.toBe('original');
    // validation is upfront — ok.txt was never moved
    await expect(fs.stat(path.join(root, 'ok.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('overwrite=true replaces the existing file', async () => {
    await fs.writeFile(path.join(root, 'f.txt'), 'old');
    const f = await makeTmpUpload('f.txt', 'new-content');
    const res = await fm.saveUploads(account, '/', [f], { overwrite: true });
    expect(res.uploaded).toEqual([{ name: 'f.txt', size: 11 }]);
    await expect(fs.readFile(path.join(root, 'f.txt'), 'utf8')).resolves.toBe('new-content');
  });

  test('overwrite=true still cannot replace a directory', async () => {
    await fs.mkdir(path.join(root, 'd'));
    const f = await makeTmpUpload('d', 'x');
    await expect(fm.saveUploads(account, '/', [f], { overwrite: true })).rejects.toMatchObject({ status: 409 });
  });

  test('400 on invalid or duplicated names', async () => {
    const bad = await makeTmpUpload('a/b.txt', 'x');
    await expect(fm.saveUploads(account, '/', [bad], { overwrite: false })).rejects.toMatchObject({ status: 400 });
    const d1 = await makeTmpUpload('same.txt', 'x');
    const d2 = await makeTmpUpload('same.txt', 'y');
    await expect(fm.saveUploads(account, '/', [d1, d2], { overwrite: false })).rejects.toMatchObject({ status: 400 });
  });

  test('404 when the target directory does not exist, 400 when target is a file', async () => {
    const f = await makeTmpUpload('x.txt', 'x');
    await expect(fm.saveUploads(account, '/missing', [f], { overwrite: false })).rejects.toMatchObject({ status: 404 });
    await fs.writeFile(path.join(root, 'plain.txt'), 'x');
    await expect(fm.saveUploads(account, '/plain.txt', [f], { overwrite: false })).rejects.toMatchObject({ status: 400 });
  });

  test('413 when the upload would exceed the plan quota', async () => {
    const tiny = await newAccount(0);
    try {
      const f = await makeTmpUpload('x.txt', 'x');
      await expect(fm.saveUploads(tiny, '/', [f], { overwrite: false })).rejects.toMatchObject({ status: 413 });
    } finally {
      await fs.rm(tiny.documentRoot as string, { recursive: true, force: true });
    }
  });
});

describe('documentRoot edge cases', () => {
  test('account without a documentRoot gets 404', async () => {
    const noRoot: FileManagerAccount = { id: 'no-root', documentRoot: null, diskQuota: 5 };
    await expect(fm.list(noRoot, '/')).rejects.toMatchObject({ status: 404 });
    await expect(fm.writeText(noRoot, '/x', 'y')).rejects.toMatchObject({ status: 404 });
  });
});
