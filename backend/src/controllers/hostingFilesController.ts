import fs from 'fs';
import fsp from 'fs/promises';
import type { Response } from 'express';
import { z } from 'zod';
import type { HostingAccount } from '@prisma/client';
import type { HostingRequest } from '../middlewares/hostingAccount';
import * as fileManager from '../services/fileManagerService';
import httpError from '../utils/httpError';
import { handleHostingError, sendOk } from './hosting/helpers';

/**
 * HTTP layer for /hosting/files. The account always comes from
 * requireHostingAccount (session user → their own account) — a client can
 * never address another user's tree. All service errors are mapped through
 * handleHostingError so httpError.status codes reach the response.
 */

// Structural view of a multer disk-storage file (avoids depending on the
// global Express.Multer namespace augmentation being loaded everywhere).
interface StagedFile {
  path: string;
  originalname: string;
}

type FilesRequest = HostingRequest & {
  files?: StagedFile[] | Record<string, StagedFile[]>;
  uploadTmpDir?: string;
};

const requireAccount = (req: HostingRequest): HostingAccount => {
  const account = req.hostingAccount;
  if (!account) {
    throw httpError(404, 'No hosting account found');
  }
  return account;
};

const queryPath = (req: HostingRequest): string => {
  const p = req.query.path;
  if (p === undefined) {
    return '/';
  }
  if (typeof p !== 'string' || p.length > 4096) {
    throw httpError(400, 'Invalid path');
  }
  return p;
};

const parseBody = <S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw httpError(400, result.error.issues[0]?.message ?? 'Invalid request body');
  }
  return result.data;
};

const mkdirSchema = z.object({
  path: z.string().max(4096).default('/'),
  name: z.string().min(1, 'name is required'),
});

const renameSchema = z.object({
  from: z.string().min(1, 'from is required').max(4096),
  to: z.string().min(1, 'to is required').max(4096),
});

const deleteSchema = z.object({
  paths: z.array(z.string().min(1).max(4096)).min(1, 'paths is required').max(100),
});

// content arrives byte-for-byte (the route is exempt from the global
// sanitizers) — it must be a string and nothing else may be coerced.
const writeContentSchema = z.object({
  path: z.string().min(1, 'path is required').max(4096),
  content: z.string({ invalid_type_error: 'content must be a string' }),
});

export const listFiles = async (req: HostingRequest, res: Response): Promise<void> => {
  try {
    const account = requireAccount(req);
    const data = await fileManager.list(account, queryPath(req));
    sendOk(res, data);
  } catch (error) {
    handleHostingError(res, error, 'Failed to list files');
  }
};

export const uploadFiles = async (req: FilesRequest, res: Response): Promise<void> => {
  const tmpDir = req.uploadTmpDir;
  try {
    const account = requireAccount(req);
    const staged = Array.isArray(req.files) ? req.files : [];
    if (staged.length === 0) {
      throw httpError(400, 'No files uploaded');
    }
    const relDir = queryPath(req);
    const overwrite = req.query.overwrite === 'true';
    const result = await fileManager.saveUploads(
      account,
      relDir,
      staged.map((file) => ({ tmpPath: file.path, name: file.originalname })),
      { overwrite },
    );
    sendOk(res, result);
  } catch (error) {
    handleHostingError(res, error, 'Upload failed');
  } finally {
    // Multer temp files are never left behind — not on success, not on a
    // failed move. (A client abort mid-body is handled by multer itself plus
    // the res 'close' sweep registered in the route.)
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
};

export const mkdir = async (req: HostingRequest, res: Response): Promise<void> => {
  try {
    const account = requireAccount(req);
    const body = parseBody(mkdirSchema, req.body);
    const entry = await fileManager.mkdir(account, body.path, body.name);
    sendOk(res, entry, { status: 201 });
  } catch (error) {
    handleHostingError(res, error, 'Failed to create directory');
  }
};

export const rename = async (req: HostingRequest, res: Response): Promise<void> => {
  try {
    const account = requireAccount(req);
    const body = parseBody(renameSchema, req.body);
    const entry = await fileManager.rename(account, body.from, body.to);
    sendOk(res, entry);
  } catch (error) {
    handleHostingError(res, error, 'Failed to rename');
  }
};

export const remove = async (req: HostingRequest, res: Response): Promise<void> => {
  try {
    const account = requireAccount(req);
    const body = parseBody(deleteSchema, req.body);
    const result = await fileManager.remove(account, body.paths);
    sendOk(res, result);
  } catch (error) {
    handleHostingError(res, error, 'Failed to delete');
  }
};

// RFC 5987: ASCII fallback filename plus a UTF-8 filename* parameter.
const contentDisposition = (name: string): string => {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'download';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

export const download = async (req: HostingRequest, res: Response): Promise<void> => {
  try {
    const account = requireAccount(req);
    const target = await fileManager.openDownload(account, queryPath(req));
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(target.size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', contentDisposition(target.name));
    const stream = fs.createReadStream(target.absPath);
    stream.on('error', () => {
      res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    handleHostingError(res, error, 'Download failed');
  }
};

export const readContent = async (req: HostingRequest, res: Response): Promise<void> => {
  try {
    const account = requireAccount(req);
    const data = await fileManager.readText(account, queryPath(req));
    sendOk(res, data);
  } catch (error) {
    handleHostingError(res, error, 'Failed to read file');
  }
};

export const writeContent = async (req: HostingRequest, res: Response): Promise<void> => {
  try {
    const account = requireAccount(req);
    const body = parseBody(writeContentSchema, req.body);
    const entry = await fileManager.writeText(account, body.path, body.content);
    sendOk(res, entry);
  } catch (error) {
    handleHostingError(res, error, 'Failed to write file');
  }
};

export default {
  listFiles,
  uploadFiles,
  mkdir,
  rename,
  remove,
  download,
  readContent,
  writeContent,
};
