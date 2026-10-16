import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';

/**
 * HTTP tests for /hosting/ftp. The ftp service is mocked (no pure-ftpd on this
 * host); prisma is mocked so the bcrypt hash write can be asserted. Auth and
 * account resolution are faked per-user like the files route tests.
 */

const mockAccounts = new Map<string, { id: string; status: string; ftpUser?: string | null; ftpPassword?: string | null }>();

jest.mock('../../src/middlewares/auth', () => ({
  authenticate: (req: Request & { user?: unknown }, res: Response, next: NextFunction) => {
    const id = req.headers['x-test-user'];
    if (typeof id !== 'string' || !id) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    req.user = { id, userId: id, email: `${id}@t.dev`, role: 'USER', isVerified: id !== 'unverified' };
    next();
  },
  requireEmailVerification: (req: Request & { user?: { isVerified?: boolean } }, res: Response, next: NextFunction) => {
    if (!req.user?.isVerified) {
      res.status(403).json({ success: false, message: 'Email verification required' });
      return;
    }
    next();
  },
}));

jest.mock('../../src/middlewares/security', () => ({
  apiRateLimit: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../../src/middlewares/hostingAccount', () => {
  const actual = jest.requireActual('../../src/middlewares/hostingAccount');
  return {
    ...actual,
    requireHostingAccount: (opts?: { allowedStatuses?: string[] }) => (
      req: Request & { user?: { userId: string }; hostingAccount?: unknown },
      res: Response,
      next: NextFunction,
    ) => {
      const account = req.user ? mockAccounts.get(req.user.userId) : undefined;
      if (!account) {
        res.status(404).json({ success: false, message: 'No hosting account found' });
        return;
      }
      const allowed = opts?.allowedStatuses ?? ['ACTIVE'];
      if (!allowed.includes(account.status)) {
        res.status(403).json({ success: false, message: `account status ${account.status} not allowed` });
        return;
      }
      req.hostingAccount = account;
      next();
    },
  };
});

jest.mock('../../src/services/ftpService');
jest.mock('../../src/config/database', () => ({
  prisma: { hostingAccount: { update: jest.fn().mockResolvedValue({}) } },
}));

// eslint-disable-next-line import/first
import * as ftpService from '../../src/services/ftpService';
// eslint-disable-next-line import/first
import { prisma } from '../../src/config/database';

const ftpRouter = require('../../src/routes/hostingFtp');

const mockIsEnabled = ftpService.isFtpEnabled as jest.Mock;
const mockReset = ftpService.resetFtpPassword as jest.Mock;
const mockUpdate = prisma.hostingAccount.update as jest.Mock;

const buildApp = () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v1/hosting/ftp', ftpRouter);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message });
  });
  return app;
};

const BASE = '/api/v1/hosting/ftp';
const AUTH = { 'x-test-user': 'user-a' };

const ENV_KEYS = ['HOSTING_FTP_DRIVER', 'HOSTING_FTP_PUBLIC_HOST', 'HOSTING_FTP_PORT'];
let savedEnv: Record<string, string | undefined> = {};

let app: ReturnType<typeof buildApp>;

beforeAll(() => {
  mockAccounts.set('user-a', { id: 'acct-a', status: 'ACTIVE', ftpUser: 'u_abc123', ftpPassword: '$2a$10$existinghash' });
  mockAccounts.set('user-nopw', { id: 'acct-np', status: 'ACTIVE', ftpUser: 'u_nopw456', ftpPassword: null });
  mockAccounts.set('user-nouser', { id: 'acct-nu', status: 'ACTIVE', ftpUser: null, ftpPassword: null });
  mockAccounts.set('suspended', { id: 'acct-s', status: 'SUSPENDED', ftpUser: 'u_susp789', ftpPassword: 'x' });
  mockAccounts.set('unverified', { id: 'acct-u', status: 'ACTIVE', ftpUser: 'u_unv000', ftpPassword: 'x' });
});

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  process.env.HOSTING_FTP_DRIVER = 'pureftpd';
  process.env.HOSTING_FTP_PUBLIC_HOST = 'ftp.example.test';
  process.env.HOSTING_FTP_PORT = '2121';
  app = buildApp();
  mockIsEnabled.mockReset().mockReturnValue(true);
  mockReset.mockReset();
  mockUpdate.mockClear();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe('GET /hosting/ftp', () => {
  test('returns the HostingFtpDTO', async () => {
    const r = await request(app).get(BASE).set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: {
        enabled: true,
        host: 'ftp.example.test',
        port: 2121,
        username: 'u_abc123',
        passwordSet: true,
      },
    });
  });

  test('passwordSet reflects whether a hash is stored; enabled reflects the driver', async () => {
    mockIsEnabled.mockReturnValue(false);
    const r = await request(app).get(BASE).set('x-test-user', 'user-nopw');
    expect(r.body.data).toMatchObject({ enabled: false, username: 'u_nopw456', passwordSet: false });
  });

  test('401 unauthenticated, 404 without an account', async () => {
    const r1 = await request(app).get(BASE);
    expect(r1.status).toBe(401);
    const r2 = await request(app).get(BASE).set('x-test-user', 'nobody');
    expect(r2.status).toBe(404);
  });

  test('a suspended account can still read its FTP settings', async () => {
    const r = await request(app).get(BASE).set('x-test-user', 'suspended');
    expect(r.status).toBe(200);
    expect(r.body.data.username).toBe('u_susp789');
  });
});

describe('POST /hosting/ftp/reset-password', () => {
  test('reveals host/port/username/plaintext once and stores a bcrypt hash', async () => {
    mockReset.mockResolvedValue('new-secret-pass-00');
    const r = await request(app).post(`${BASE}/reset-password`).set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      host: 'ftp.example.test',
      port: 2121,
      username: 'u_abc123',
      password: 'new-secret-pass-00',
    });
    expect(mockReset).toHaveBeenCalledWith('u_abc123');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const update = mockUpdate.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'acct-a' });
    const storedHash: string = update.data.ftpPassword;
    expect(storedHash).toMatch(/^\$2[aby]\$/);
    expect(storedHash).not.toContain('new-secret-pass-00');
  });

  test('503 when the driver is not enabled', async () => {
    mockIsEnabled.mockReturnValue(false);
    const r = await request(app).post(`${BASE}/reset-password`).set(AUTH);
    expect(r.status).toBe(503);
    expect(r.body.message).toBe('FTP is not enabled');
    expect(mockReset).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('404 when the account has no FTP user', async () => {
    const r = await request(app).post(`${BASE}/reset-password`).set('x-test-user', 'user-nouser');
    expect(r.status).toBe(404);
    expect(mockReset).not.toHaveBeenCalled();
  });

  test('503 when the service throws FTP-is-disabled', async () => {
    const { httpError } = require('../../src/utils/httpError');
    mockReset.mockRejectedValue(httpError(503, 'FTP is not enabled'));
    const r = await request(app).post(`${BASE}/reset-password`).set(AUTH);
    expect(r.status).toBe(503);
  });

  test('502 when pure-pw fails — detail stays out of the response', async () => {
    const { httpError } = require('../../src/utils/httpError');
    mockReset.mockRejectedValue(httpError(502, 'FTP server error'));
    const r = await request(app).post(`${BASE}/reset-password`).set(AUTH);
    expect(r.status).toBe(502);
    expect(r.body.message).toBe('FTP server error');
  });

  test('403 for suspended and unverified users (mutation gate)', async () => {
    const s = await request(app).post(`${BASE}/reset-password`).set('x-test-user', 'suspended');
    expect(s.status).toBe(403);
    const u = await request(app).post(`${BASE}/reset-password`).set('x-test-user', 'unverified');
    expect(u.status).toBe(403);
    expect(mockReset).not.toHaveBeenCalled();
  });

  test('401 unauthenticated', async () => {
    const r = await request(app).post(`${BASE}/reset-password`);
    expect(r.status).toBe(401);
  });
});
