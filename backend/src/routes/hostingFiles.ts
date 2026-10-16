import crypto from 'crypto';
import express from 'express';
import type { NextFunction, Response } from 'express';
import fsp from 'fs/promises';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { getHostingConfig } from '../config/hosting';
import controller from '../controllers/hostingFilesController';
import { handleHostingError } from '../controllers/hosting/helpers';
import { authenticate, requireEmailVerification } from '../middlewares/auth';
import { ANY_LIVE_STATUS, requireHostingAccount } from '../middlewares/hostingAccount';
import type { HostingRequest } from '../middlewares/hostingAccount';
import { apiRateLimit } from '../middlewares/security';
import httpError from '../utils/httpError';

/**
 * Mounted at /api/v1/hosting/files by routes/hosting.ts BEFORE the
 * router-level sanitizers, so this router owns all input validation. The
 * global sanitizers still run except for PUT /files/content, which must keep
 * file bytes verbatim (its body is validated with zod in the controller).
 *
 * Reads are available to every non-TERMINATED account (ANY_LIVE_STATUS —
 * suspended users can still fetch/backup their files); every mutation
 * requires an ACTIVE, email-verified account and is rate limited.
 */

const router = express.Router();

const MAX_UPLOAD_FILES = 20;

type UploadRequest = HostingRequest & { uploadTmpDir?: string };

const readAccount = (req: HostingRequest, res: Response) => {
  const account = req.hostingAccount;
  if (!account) {
    res.status(404).json({ success: false, message: 'No hosting account found' });
    return null;
  }
  return account;
};

// Upload staging lives outside the docroot: os.tmpdir()/sahary-uploads/
// <accountId>/<requestId>. The res 'close' hook sweeps the staging dir when
// the client aborts mid-upload (multer already removes its own temp files;
// this also removes the empty dir and any stragglers).
const prepareUploadTmpDir = (req: UploadRequest, res: Response, next: NextFunction): void => {
  const account = readAccount(req, res);
  if (!account) {
    return;
  }
  const dir = path.join(os.tmpdir(), 'sahary-uploads', account.id, crypto.randomUUID());
  req.uploadTmpDir = dir;
  res.on('close', () => {
    void fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  });
  next();
};

const uploadStorage = multer.diskStorage({
  destination: (req: express.Request, _file, cb) => {
    const dir = (req as UploadRequest).uploadTmpDir;
    if (!dir) {
      cb(new Error('upload staging directory missing'), '');
      return;
    }
    fsp.mkdir(dir, { recursive: true }).then(() => cb(null, dir), (error) => cb(error, dir));
  },
});

// Runs multer with per-request limits (getHostingConfig re-reads env, so
// tests can change HOSTING_UPLOAD_MAX_MB without re-importing). Multer errors
// are mapped to the API envelope here because next(err) would only reach the
// generic error handler as a 500.
const runMultipartUpload = (req: UploadRequest, res: Response, next: NextFunction): void => {
  const { files } = getHostingConfig();
  const upload = multer({
    storage: uploadStorage,
    // Browsers send UTF-8 filenames — multer's latin1 default would mangle
    // non-ASCII names.
    defParamCharset: 'utf8',
    limits: {
      fileSize: files.uploadMaxMB * 1024 * 1024,
      files: MAX_UPLOAD_FILES,
    },
  });
  upload.array('files', MAX_UPLOAD_FILES)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const { code } = err as { code?: string; name?: string };
    if (err instanceof multer.MulterError || (err as { name?: string }).name === 'MulterError') {
      handleHostingError(
        res,
        code === 'LIMIT_FILE_SIZE'
          ? httpError(413, `File exceeds the ${files.uploadMaxMB} MB per-file limit`)
          : httpError(400, 'Invalid upload request'),
        'Upload failed',
      );
      return;
    }
    handleHostingError(res, err, 'Upload failed');
  });
};

router.get('/', authenticate, requireHostingAccount({ allowedStatuses: ANY_LIVE_STATUS }), controller.listFiles);
router.get('/download', authenticate, requireHostingAccount({ allowedStatuses: ANY_LIVE_STATUS }), controller.download);
router.get('/content', authenticate, requireHostingAccount({ allowedStatuses: ANY_LIVE_STATUS }), controller.readContent);

router.post(
  '/upload',
  apiRateLimit(),
  authenticate,
  requireEmailVerification,
  requireHostingAccount(),
  prepareUploadTmpDir,
  runMultipartUpload,
  controller.uploadFiles,
);
router.post('/mkdir', apiRateLimit(), authenticate, requireEmailVerification, requireHostingAccount(), controller.mkdir);
router.post('/rename', apiRateLimit(), authenticate, requireEmailVerification, requireHostingAccount(), controller.rename);
router.delete('/', apiRateLimit(), authenticate, requireEmailVerification, requireHostingAccount(), controller.remove);
router.put('/content', apiRateLimit(), authenticate, requireEmailVerification, requireHostingAccount(), controller.writeContent);

export = router;
