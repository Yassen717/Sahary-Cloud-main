import crypto from 'crypto';
import { constants } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type { Stats } from 'fs';
import { getHostingConfig } from '../config/hosting';
import type { FileEntryDTO, FileListDTO } from '../types/hosting';
import httpError from '../utils/httpError';
import { getDirectorySizeBytes, resolveSandboxedPath } from './hostingFsUtils';

/**
 * Web file manager service (CONTRACT policy P9). Every client-supplied path is
 * resolved through resolveSandboxedPath — `..` escapes, absolute/drive paths,
 * NUL bytes and symlink escapes all fail before any filesystem op. The account
 * document root itself can never be deleted, renamed or written over.
 *
 * Quota: a write is allowed only while `used + incoming <= diskQuota` (fresh
 * getDirectorySizeBytes, cached for up to 60 s per account and invalidated
 * after every write so back-to-back operations can't exploit the cache).
 */

export interface FileManagerAccount {
  id: string;
  documentRoot: string | null;
  /** GB, copied from the plan at provisioning time */
  diskQuota: number;
}

export interface IncomingUpload {
  tmpPath: string;
  name: string;
}

export interface DownloadTarget {
  absPath: string;
  name: string;
  size: number;
}

export interface TextFileContent {
  path: string;
  content: string;
  size: number;
}

const LIST_MAX_ENTRIES = 5000;
const MAX_DELETE_PATHS = 100;
const MAX_NAME_BYTES = 255;
const BINARY_PROBE_BYTES = 8 * 1024;
const QUOTA_CACHE_TTL_MS = 60 * 1000;
const BYTES_PER_GB = 1024 ** 3;
const FILE_MODE = 0o644;
const DIR_MODE = 0o755;
const READDIR_CONCURRENCY = 64;

// P9 name rules: no path separators, no Windows-reserved characters, no
// control characters, never "." / "..", at most 255 bytes.
const FORBIDDEN_NAME_CHARS = /[/\\:*?"<>|]/;
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.yml': 'application/yaml',
  '.yaml': 'application/yaml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.tgz': 'application/gzip',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.php': 'application/x-httpd-php',
  '.sh': 'text/x-shellscript',
  '.log': 'text/plain',
  '.sql': 'application/sql',
};

const mimeFor = (name: string): string | null => MIME_BY_EXT[path.extname(name).toLowerCase()] ?? null;

const errnoCode = (error: unknown): string | undefined =>
  (error as NodeJS.ErrnoException | undefined)?.code;

// Account roots are provisioned asynchronously; until then there is no tree.
const rootFor = (account: FileManagerAccount): string => {
  if (!account.documentRoot) {
    throw httpError(404, 'Document root is not provisioned for this account');
  }
  return account.documentRoot;
};

const realRootOf = async (root: string): Promise<string> => {
  try {
    return await fs.realpath(root);
  } catch {
    return path.resolve(root);
  }
};

// resolveSandboxedPath already returns 400 for escapes; a dangling final
// symlink surfaces as raw ENOENT from realpath — map it to 404.
const resolveInside = async (root: string, relPath: string): Promise<string> => {
  try {
    return await resolveSandboxedPath(root, relPath);
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      throw httpError(404, 'Path not found');
    }
    throw error;
  }
};

const displayPath = (realRoot: string, abs: string): string => {
  const rel = path.relative(realRoot, abs);
  if (!rel) {
    return '/';
  }
  return `/${rel.split(path.sep).join('/')}`;
};

const statOr404 = async (abs: string): Promise<Stats> => {
  try {
    return await fs.stat(abs);
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      throw httpError(404, 'Path not found');
    }
    throw error;
  }
};

const lstatOr404 = async (abs: string): Promise<Stats> => {
  try {
    return await fs.lstat(abs);
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      throw httpError(404, 'Path not found');
    }
    throw error;
  }
};

const lstatOrNull = async (abs: string): Promise<Stats | null> => {
  try {
    return await fs.lstat(abs);
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const existsAt = async (abs: string): Promise<boolean> => (await lstatOrNull(abs)) !== null;

const assertEntryName = (name: string): void => {
  if (
    typeof name !== 'string'
    || name.length === 0
    || name === '.'
    || name === '..'
    || FORBIDDEN_NAME_CHARS.test(name)
    || CONTROL_CHARS.test(name)
    || Buffer.byteLength(name, 'utf8') > MAX_NAME_BYTES
  ) {
    throw httpError(400, 'Invalid file name');
  }
};

// Per-account disk-usage cache (<= 60 s), dropped after every mutating call.
const usageCache = new Map<string, { bytes: number; at: number }>();

export const invalidateUsageCache = (accountId: string): void => {
  usageCache.delete(accountId);
};

const usedBytes = async (account: FileManagerAccount, root: string): Promise<number> => {
  const hit = usageCache.get(account.id);
  if (hit && Date.now() - hit.at < QUOTA_CACHE_TTL_MS) {
    return hit.bytes;
  }
  const bytes = await getDirectorySizeBytes(root);
  usageCache.set(account.id, { bytes, at: Date.now() });
  return bytes;
};

const assertWriteQuota = async (
  account: FileManagerAccount,
  root: string,
  incomingBytes: number,
): Promise<void> => {
  if (incomingBytes <= 0) {
    return;
  }
  const used = await usedBytes(account, root);
  if (used + incomingBytes > account.diskQuota * BYTES_PER_GB) {
    throw httpError(413, `Not enough disk space (plan limit ${account.diskQuota} GB)`);
  }
};

// Move a file that must never clobber an existing destination: hard-link +
// unlink gives atomic no-clobber semantics on the same volume; an exclusive
// copy covers cross-device staging (os.tmpdir vs docroot).
const moveFileNoClobber = async (src: string, dst: string): Promise<void> => {
  try {
    await fs.link(src, dst);
  } catch (error) {
    const code = errnoCode(error);
    if (code === 'EEXIST' || code === 'EISDIR') {
      throw httpError(409, 'A file or directory with that name already exists');
    }
    if (code !== 'EXDEV' && code !== 'EPERM') {
      throw error;
    }
    try {
      await fs.copyFile(src, dst, constants.COPYFILE_EXCL);
    } catch (copyError) {
      if (errnoCode(copyError) === 'EEXIST' || errnoCode(copyError) === 'EISDIR') {
        throw httpError(409, 'A file or directory with that name already exists');
      }
      throw copyError;
    }
  }
  await fs.unlink(src);
};

const moveFileReplace = async (src: string, dst: string): Promise<void> => {
  try {
    await fs.rename(src, dst);
    return;
  } catch (error) {
    if (errnoCode(error) !== 'EXDEV') {
      throw error;
    }
  }
  await fs.copyFile(src, dst);
  await fs.unlink(src);
};

// Entries a symlink inside the root may point at are already proven in-root by
// resolveSandboxedPath; lstat keeps the symlink itself (never followed) so a
// dangling or outbound link can still be listed/deleted.
const toEntry = (realRoot: string, abs: string, st: Stats): FileEntryDTO => {
  const name = path.basename(abs);
  const isDir = st.isDirectory();
  return {
    name,
    path: displayPath(realRoot, abs),
    type: isDir ? 'directory' : 'file',
    size: isDir || st.isSymbolicLink() ? 0 : st.size,
    modifiedAt: st.mtime.toISOString(),
    mime: isDir ? null : mimeFor(name),
  };
};

export async function list(
  account: FileManagerAccount,
  relPath = '/',
  opts?: { maxEntries?: number },
): Promise<FileListDTO> {
  const root = rootFor(account);
  const maxEntries = opts?.maxEntries ?? LIST_MAX_ENTRIES;
  const abs = await resolveInside(root, relPath);
  const st = await statOr404(abs);
  if (!st.isDirectory()) {
    throw httpError(400, 'Not a directory');
  }
  const realRoot = await realRootOf(root);
  const dirents = await fs.readdir(abs, { withFileTypes: true });

  const entries: FileEntryDTO[] = [];
  for (let i = 0; i < dirents.length; i += READDIR_CONCURRENCY) {
    const chunk = await Promise.all(dirents.slice(i, i + READDIR_CONCURRENCY).map(async (dirent) => {
      const child = path.join(abs, dirent.name);
      const lst = await lstatOrNull(child);
      return lst ? toEntry(realRoot, child, lst) : null;
    }));
    for (const entry of chunk) {
      if (entry) {
        entries.push(entry);
      }
    }
  }

  entries.sort((a, b) => (a.type === b.type
    ? a.name.localeCompare(b.name)
    : a.type === 'directory' ? -1 : 1));

  const truncated = entries.length > maxEntries;
  const parent = abs === realRoot ? null : displayPath(realRoot, path.dirname(abs));
  return {
    path: displayPath(realRoot, abs),
    parent,
    entries: entries.slice(0, maxEntries),
    truncated,
  };
}

export async function mkdir(
  account: FileManagerAccount,
  parentRel: string,
  name: string,
): Promise<FileEntryDTO> {
  const root = rootFor(account);
  assertEntryName(name);
  const dirAbs = await resolveInside(root, parentRel);
  const pst = await statOr404(dirAbs);
  if (!pst.isDirectory()) {
    throw httpError(400, 'Not a directory');
  }
  const child = path.join(dirAbs, name);
  if (await existsAt(child)) {
    throw httpError(409, 'A file or directory with that name already exists');
  }
  try {
    try {
      await fs.mkdir(child, { mode: DIR_MODE });
    } catch (error) {
      // TOCTOU: the entry appeared between the existsAt check and mkdir.
      if (errnoCode(error) === 'EEXIST') {
        throw httpError(409, 'A file or directory with that name already exists');
      }
      throw error;
    }
    await fs.chmod(child, DIR_MODE);
  } finally {
    invalidateUsageCache(account.id);
  }
  const realRoot = await realRootOf(root);
  return toEntry(realRoot, child, await fs.lstat(child));
}

export async function rename(
  account: FileManagerAccount,
  fromRel: string,
  toRel: string,
): Promise<FileEntryDTO> {
  const root = rootFor(account);
  const fromAbs = await resolveInside(root, fromRel);
  const toAbs = await resolveInside(root, toRel);
  const realRoot = await realRootOf(root);
  if (fromAbs === realRoot || toAbs === realRoot) {
    throw httpError(400, 'The account root cannot be renamed');
  }
  assertEntryName(path.basename(toAbs));

  const st = await lstatOr404(fromAbs);
  if (st.isDirectory()) {
    const rel = path.relative(fromAbs, toAbs);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      throw httpError(400, 'Cannot move a directory into itself');
    }
  }
  if (await existsAt(toAbs)) {
    throw httpError(409, 'A file or directory with that name already exists');
  }
  const parent = path.dirname(toAbs);
  const pst = await statOr404(parent);
  if (!pst.isDirectory()) {
    throw httpError(400, 'Not a directory');
  }

  try {
    try {
      await fs.rename(fromAbs, toAbs);
    } catch (error) {
      if (errnoCode(error) !== 'EXDEV') {
        throw error;
      }
      // Cross-device fallback (a mount inside the docroot): recursive copy then
      // delete the source.
      if (st.isDirectory()) {
        await fs.cp(fromAbs, toAbs, {
          recursive: true, verbatimSymlinks: true, force: false, errorOnExist: true,
        });
        await fs.rm(fromAbs, { recursive: true, force: true });
      } else {
        await fs.copyFile(fromAbs, toAbs);
        await fs.unlink(fromAbs);
      }
    }
    const nst = await fs.lstat(toAbs);
    await fs.chmod(toAbs, nst.isDirectory() ? DIR_MODE : FILE_MODE);
  } finally {
    invalidateUsageCache(account.id);
  }
  return toEntry(realRoot, toAbs, await fs.lstat(toAbs));
}

export async function remove(
  account: FileManagerAccount,
  relPaths: string[],
): Promise<{ deleted: number }> {
  const root = rootFor(account);
  if (!Array.isArray(relPaths) || relPaths.length === 0) {
    throw httpError(400, 'paths must be a non-empty array');
  }
  if (relPaths.length > MAX_DELETE_PATHS) {
    throw httpError(400, `Cannot delete more than ${MAX_DELETE_PATHS} paths at once`);
  }
  const realRoot = await realRootOf(root);
  const targets: string[] = [];
  for (const rel of relPaths) {
    if (typeof rel !== 'string') {
      throw httpError(400, 'paths must be a non-empty array');
    }
    // Sequential resolution keeps the reported error deterministic.
    targets.push(await resolveInside(root, rel));
  }
  for (const target of targets) {
    if (target === realRoot) {
      throw httpError(400, 'The account root cannot be deleted');
    }
  }
  // Verify every path exists before deleting anything — a missing path is a
  // 404 for the whole request, not a partial delete.
  for (const target of targets) {
    await lstatOr404(target);
  }
  try {
    for (const target of targets) {
      await fs.rm(target, { recursive: true, force: true });
    }
  } finally {
    invalidateUsageCache(account.id);
  }
  return { deleted: targets.length };
}

export async function openDownload(
  account: FileManagerAccount,
  relPath: string,
): Promise<DownloadTarget> {
  const root = rootFor(account);
  const abs = await resolveInside(root, relPath);
  const st = await statOr404(abs);
  if (st.isDirectory()) {
    throw httpError(400, 'Cannot download a directory');
  }
  return { absPath: abs, name: path.basename(abs), size: st.size };
}

export async function readText(
  account: FileManagerAccount,
  relPath: string,
): Promise<TextFileContent> {
  const root = rootFor(account);
  const abs = await resolveInside(root, relPath);
  const st = await statOr404(abs);
  if (st.isDirectory()) {
    throw httpError(400, 'Cannot read a directory');
  }
  const maxKB = getHostingConfig().files.textEditMaxKB;
  if (st.size > maxKB * 1024) {
    throw httpError(413, `File exceeds the ${maxKB} KB text edit limit`);
  }
  const buf = await fs.readFile(abs);
  // NUL within the first 8 KB marks the file as binary — refuse to serve it to
  // the text editor (415) rather than emitting corrupt text.
  if (buf.subarray(0, BINARY_PROBE_BYTES).includes(0)) {
    throw httpError(415, 'Binary files cannot be opened as text');
  }
  const realRoot = await realRootOf(root);
  return { path: displayPath(realRoot, abs), content: buf.toString('utf8'), size: st.size };
}

export async function writeText(
  account: FileManagerAccount,
  relPath: string,
  content: string,
): Promise<FileEntryDTO> {
  const root = rootFor(account);
  const abs = await resolveInside(root, relPath);
  const realRoot = await realRootOf(root);
  if (abs === realRoot) {
    throw httpError(400, 'The account root cannot be written over');
  }
  assertEntryName(path.basename(abs));
  const parent = path.dirname(abs);
  const pst = await statOr404(parent);
  if (!pst.isDirectory()) {
    throw httpError(400, 'Not a directory');
  }
  const existing = await lstatOrNull(abs);
  if (existing?.isDirectory()) {
    throw httpError(400, 'Cannot write to a directory');
  }

  // Quota is charged on the size delta only — shrinking a file must stay
  // possible even when the account is already at its limit.
  const delta = Buffer.byteLength(content, 'utf8') - (existing?.size ?? 0);
  try {
    await assertWriteQuota(account, root, delta);

    // Atomic same-directory temp + rename so readers never see a half file.
    const tmp = path.join(parent, `.sahary-write-${crypto.randomBytes(8).toString('hex')}`);
    try {
      await fs.writeFile(tmp, content, { encoding: 'utf8', mode: FILE_MODE });
      await fs.rename(tmp, abs);
    } catch (error) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw error;
    }
    await fs.chmod(abs, FILE_MODE);
  } finally {
    invalidateUsageCache(account.id);
  }
  return toEntry(realRoot, abs, await fs.lstat(abs));
}

export interface SavedUpload {
  name: string;
  size: number;
}

/**
 * Moves staged upload temp files into `relDir`. Temp files live outside the
 * docroot (os.tmpdir); the caller owns their cleanup. All-or-nothing
 * validation happens before the first move: names, duplicates, collisions and
 * quota are checked upfront so a reject leaves the tree untouched.
 */
export async function saveUploads(
  account: FileManagerAccount,
  relDir: string,
  files: IncomingUpload[],
  opts: { overwrite: boolean },
): Promise<{ uploaded: SavedUpload[] }> {
  const root = rootFor(account);
  const dirAbs = await resolveInside(root, relDir);
  const dst = await statOr404(dirAbs);
  if (!dst.isDirectory()) {
    throw httpError(400, 'Upload target is not a directory');
  }

  const seen = new Set<string>();
  const staged: Array<{ tmpPath: string; name: string; size: number; dst: string }> = [];
  for (const file of files) {
    assertEntryName(file.name);
    if (seen.has(file.name)) {
      throw httpError(400, 'Duplicate file name in upload');
    }
    seen.add(file.name);
    const st = await lstatOr404(file.tmpPath);
    staged.push({ tmpPath: file.tmpPath, name: file.name, size: st.size, dst: path.join(dirAbs, file.name) });
  }

  try {
    let incoming = 0;
    for (const file of staged) {
      incoming += file.size;
    }
    await assertWriteQuota(account, root, incoming);

    for (const file of staged) {
      const existing = await lstatOrNull(file.dst);
      if (existing && (!opts.overwrite || existing.isDirectory())) {
        throw httpError(409, `'${file.name}' already exists`);
      }
    }

    for (const file of staged) {
      if (opts.overwrite) {
        await moveFileReplace(file.tmpPath, file.dst);
      } else {
        await moveFileNoClobber(file.tmpPath, file.dst);
      }
      await fs.chmod(file.dst, FILE_MODE);
    }
  } finally {
    invalidateUsageCache(account.id);
  }

  return { uploaded: staged.map(({ name, size }) => ({ name, size })) };
}
