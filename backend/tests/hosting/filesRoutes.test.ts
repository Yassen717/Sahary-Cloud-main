import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import request from 'supertest';

/**
 * HTTP tests for /hosting/files on a small app that mounts the REAL router
 * plus the REAL global sanitizers (same order as src/index.ts). Auth and
 * account resolution are faked per-user so we can prove the sandbox is
 * always scoped to the session user's account.
 */

const mockAccounts = new Map<string, { id: string; documentRoot: string; diskQuota: number; status: string }>();

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

jest.mock('../../src/middlewares/security', () => {
  const actual = jest.requireActual('../../src/middlewares/security');
  return {
    ...actual,
    apiRateLimit: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  };
});

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

// eslint-disable-next-line import/first
import { checkXSS, preventNoSQLInjection, sanitizeAll } from '../../src/middlewares/sanitization';
// eslint-disable-next-line import/first
import { sanitizeInput, xssProtection } from '../../src/middlewares/security';

const filesRouter = require('../../src/routes/hostingFiles');

const buildApp = () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // Same global sanitizers + order as src/index.ts.
  app.use(sanitizeAll);
  app.use(checkXSS);
  app.use(preventNoSQLInjection);
  // Mirror routes/hosting.ts: /files mounts BEFORE the router-level
  // sanitizers; everything after them is sanitized. The /probe route proves
  // the router-level sanitizers really run in this app.
  const hosting = express.Router();
  hosting.use('/files', filesRouter);
  hosting.use(sanitizeInput());
  hosting.use(xssProtection());
  hosting.post('/probe', (req: Request, res: Response) => {
    res.json({ success: true, marker: req.body?.marker });
  });
  app.use('/api/v1/hosting', hosting);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.statusCode ?? 400).json({ success: false, message: err.message });
  });
  return app;
};

const BASE = '/api/v1/hosting/files';
const AUTH = { 'x-test-user': 'user-a' };

let app: ReturnType<typeof buildApp>;
let rootA: string;
let rootB: string;
const createdRoots: string[] = [];

const waitForBool = async (cond: () => Promise<boolean>, ms = 2000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await cond()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 15));
  }
  return cond();
};

const waitFor = async (cond: () => Promise<boolean>, ms = 2000): Promise<void> => {
  expect(await waitForBool(cond, ms)).toBe(true);
};

const dirIsEmptyOrGone = async (dir: string): Promise<boolean> => {
  try {
    return (await fs.readdir(dir)).length === 0;
  } catch {
    return true;
  }
};

beforeAll(async () => {
  rootA = await fs.mkdtemp(path.join(os.tmpdir(), 'sahary-wp04-http-a-'));
  rootB = await fs.mkdtemp(path.join(os.tmpdir(), 'sahary-wp04-http-b-'));
  createdRoots.push(rootA, rootB);
  await fs.writeFile(path.join(rootA, 'index.html'), '<h1>A</h1>');
  await fs.mkdir(path.join(rootA, 'docs'));
  await fs.writeFile(path.join(rootA, 'docs', 'a.txt'), 'aaa');
  await fs.writeFile(path.join(rootB, 'only-b.txt'), 'B file');
  mockAccounts.set('user-a', { id: 'acct-a', documentRoot: rootA, diskQuota: 5, status: 'ACTIVE' });
  mockAccounts.set('user-b', { id: 'acct-b', documentRoot: rootB, diskQuota: 5, status: 'ACTIVE' });
  mockAccounts.set('suspended', { id: 'acct-s', documentRoot: rootB, diskQuota: 5, status: 'SUSPENDED' });
  mockAccounts.set('quota-full', { id: 'acct-q', documentRoot: rootB, diskQuota: 0, status: 'ACTIVE' });
  mockAccounts.set('unverified', { id: 'acct-u', documentRoot: rootA, diskQuota: 5, status: 'ACTIVE' });
});

afterAll(async () => {
  for (const dir of createdRoots) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  await fs.rm(path.join(os.tmpdir(), 'sahary-uploads', 'acct-a'), { recursive: true, force: true });
  await fs.rm(path.join(os.tmpdir(), 'sahary-uploads', 'acct-q'), { recursive: true, force: true });
});

beforeEach(() => {
  app = buildApp();
});

describe('auth & status gates', () => {
  test('401 without a session', async () => {
    const r = await request(app).get(`${BASE}?path=/`);
    expect(r.status).toBe(401);
  });

  test('403 on writes for unverified users; reads still pass', async () => {
    const w = await request(app).post(`${BASE}/mkdir`).set('x-test-user', 'unverified').send({ path: '/', name: 'd' });
    expect(w.status).toBe(403);
    const r = await request(app).get(`${BASE}?path=/`).set('x-test-user', 'unverified');
    expect(r.status).toBe(200);
  });

  test('suspended account can read but not write', async () => {
    const r = await request(app).get(`${BASE}?path=/`).set('x-test-user', 'suspended');
    expect(r.status).toBe(200);
    const w = await request(app).post(`${BASE}/mkdir`).set('x-test-user', 'suspended').send({ path: '/', name: 'd' });
    expect(w.status).toBe(403);
  });

  test('404 when the user has no account', async () => {
    const r = await request(app).get(`${BASE}?path=/`).set('x-test-user', 'nobody');
    expect(r.status).toBe(404);
  });
});

describe('GET / list', () => {
  test('lists the account root as FileListDTO', async () => {
    const r = await request(app).get(`${BASE}?path=/`).set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.path).toBe('/');
    expect(r.body.data.parent).toBeNull();
    expect(r.body.data.truncated).toBe(false);
    expect(r.body.data.entries.map((e: { name: string }) => e.name)).toEqual(['docs', 'index.html']);
  });

  test.each([
    '..%2F..%2Fetc',
    '%2e%2e%2f%2e%2e%2f',
    '..%5C..%5Cwindows',
    'C%3A%5CWindows',
  ])('rejects encoded traversal %s with 400', async (p) => {
    const r = await request(app).get(`${BASE}?path=${p}`).set(AUTH);
    expect(r.status).toBe(400);
  });

  test('rejects path arrays/objects with 400', async () => {
    const r = await request(app).get(`${BASE}?path[]=/&path[]=/x`).set(AUTH);
    expect(r.status).toBe(400);
  });

  test('404 for a missing directory', async () => {
    const r = await request(app).get(`${BASE}?path=/missing`).set(AUTH);
    expect(r.status).toBe(404);
  });
});

describe('authorization scoping', () => {
  test('each user only ever sees their own document root', async () => {
    const ra = await request(app).get(`${BASE}?path=/`).set('x-test-user', 'user-a');
    expect(ra.body.data.entries.map((e: { name: string }) => e.name)).toContain('index.html');

    const rb = await request(app).get(`${BASE}?path=/`).set('x-test-user', 'user-b');
    expect(rb.body.data.entries.map((e: { name: string }) => e.name)).toEqual(['only-b.txt']);

    // A's file is not reachable from B's root at any relative path.
    const r = await request(app).get(`${BASE}/content?path=/index.html`).set('x-test-user', 'user-b');
    expect(r.status).toBe(404);
  });
});

describe('mkdir / rename / delete', () => {
  test('mkdir creates and returns the entry (201)', async () => {
    const r = await request(app).post(`${BASE}/mkdir`).set(AUTH).send({ path: '/', name: 'madeit' });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ name: 'madeit', path: '/madeit', type: 'directory' });
    await fs.rmdir(path.join(rootA, 'madeit'));
  });

  test('mkdir 409 on existing name, 400 on invalid name', async () => {
    await request(app).post(`${BASE}/mkdir`).set(AUTH).send({ path: '/', name: 'dupd' });
    const dup = await request(app).post(`${BASE}/mkdir`).set(AUTH).send({ path: '/', name: 'dupd' });
    expect(dup.status).toBe(409);
    await fs.rmdir(path.join(rootA, 'dupd'));

    const bad = await request(app).post(`${BASE}/mkdir`).set(AUTH).send({ path: '/', name: 'a/b' });
    expect(bad.status).toBe(400);
  });

  test('rename moves files and never overwrites', async () => {
    await fs.writeFile(path.join(rootA, 'rn.txt'), 'data');
    const r = await request(app).post(`${BASE}/rename`).set(AUTH).send({ from: 'rn.txt', to: 'docs/rn.txt' });
    expect(r.status).toBe(200);
    expect(r.body.data.path).toBe('/docs/rn.txt');
    await expect(fs.readFile(path.join(rootA, 'docs', 'rn.txt'), 'utf8')).resolves.toBe('data');
    await fs.unlink(path.join(rootA, 'docs', 'rn.txt'));

    await fs.writeFile(path.join(rootA, 'n1.txt'), '1');
    await fs.writeFile(path.join(rootA, 'n2.txt'), '2');
    const conflict = await request(app).post(`${BASE}/rename`).set(AUTH).send({ from: 'n1.txt', to: 'n2.txt' });
    expect(conflict.status).toBe(409);
    await fs.unlink(path.join(rootA, 'n1.txt'));
    await fs.unlink(path.join(rootA, 'n2.txt'));
  });

  test('delete removes files/dirs and refuses the root', async () => {
    await fs.writeFile(path.join(rootA, 'del.txt'), 'x');
    await fs.mkdir(path.join(rootA, 'deldir'));
    const r = await request(app).delete(`${BASE}`).set(AUTH).send({ paths: ['del.txt', 'deldir'] });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ deleted: 2 });

    const rootDel = await request(app).delete(`${BASE}`).set(AUTH).send({ paths: ['/'] });
    expect(rootDel.status).toBe(400);
    await expect(fs.stat(rootA)).resolves.toBeTruthy();
  });

  test('delete validates the body', async () => {
    const noPaths = await request(app).delete(`${BASE}`).set(AUTH).send({});
    expect(noPaths.status).toBe(400);
    const tooMany = await request(app).delete(`${BASE}`).set(AUTH).send({ paths: Array(101).fill('x') });
    expect(tooMany.status).toBe(400);
  });
});

describe('download', () => {
  test('streams the file with attachment + nosniff headers', async () => {
    const r = await request(app).get(`${BASE}/download?path=/index.html`).set(AUTH).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/octet-stream');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-disposition']).toContain('attachment');
    expect(r.headers['content-disposition']).toContain('filename="index.html"');
    expect(r.headers['content-disposition']).toContain("filename*=UTF-8''index.html");
    expect(r.body.toString()).toBe('<h1>A</h1>');
  });

  test('RFC 5987 encodes non-ASCII filenames', async () => {
    await fs.writeFile(path.join(rootA, 'café.txt'), 'x');
    const r = await request(app).get(`${BASE}/download?path=/caf%C3%A9.txt`).set(AUTH);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain("filename*=UTF-8''caf%C3%A9.txt");
    await fs.unlink(path.join(rootA, 'café.txt'));
  });

  test('400 for a directory, 404 for missing', async () => {
    const d = await request(app).get(`${BASE}/download?path=/docs`).set(AUTH);
    expect(d.status).toBe(400);
    const m = await request(app).get(`${BASE}/download?path=/nope`).set(AUTH);
    expect(m.status).toBe(404);
  });
});

describe('text content read/write', () => {
  test('PUT /content writes and GET /content reads it back byte-for-byte', async () => {
    const html = '<!doctype html><html><body><script>alert("x")</script><p>café €</p></body></html>';
    const w = await request(app).put(`${BASE}/content`).set(AUTH).send({ path: '/edit.html', content: html });
    expect(w.status).toBe(200);
    expect(w.body.data).toMatchObject({ name: 'edit.html', path: '/edit.html', type: 'file' });
    await expect(fs.readFile(path.join(rootA, 'edit.html'), 'utf8')).resolves.toBe(html);

    const r = await request(app).get(`${BASE}/content?path=/edit.html`).set(AUTH);
    expect(r.status).toBe(200);
    expect(r.body.data.content).toBe(html);
    expect(r.body.data.size).toBe(Buffer.byteLength(html));
    await fs.unlink(path.join(rootA, 'edit.html'));
  });

  test('PUT /content is exempt from XSS/NoSQL sanitization (script content survives)', async () => {
    // `content` is a preserved-text field, so a script payload there alone
    // would pass even without the route exemption. `marker` is NOT preserved:
    // if isHostingFileContentWrite ever stops matching, checkXSS throws
    // ValidationError on it and this becomes a 400 instead of a 200.
    const payload = '<script>alert(1)</script><img onerror="x" src=y>';
    const w = await request(app).put(`${BASE}/content`).set(AUTH).send({
      path: '/xss.html',
      content: payload,
      marker: '<script>alert(1)</script>',
    });
    expect(w.status).toBe(200);
    expect(w.body.success).toBe(true);
    await expect(fs.readFile(path.join(rootA, 'xss.html'), 'utf8')).resolves.toBe(payload);
    await fs.unlink(path.join(rootA, 'xss.html'));
  });

  test('other routes are still sanitized — script in a normal field is rejected', async () => {
    // Global checkXSS (no exemption for this route) rejects the request.
    const r = await request(app).post(`${BASE}/mkdir`).set(AUTH).send({ path: '/', name: '<script>alert(1)</script>' });
    expect(r.status).toBe(400);
  });

  test('the router-level sanitizers after /files really run (probe route)', async () => {
    // Mount-order proof: /probe sits behind sanitizeInput/xssProtection. A
    // benign HTML tag passes the global checks but sanitizeInput strips it —
    // so an echoed 'bold' proves the router-level sanitizer really ran.
    const r = await request(app)
      .post('/api/v1/hosting/probe')
      .send({ marker: '<b>bold</b>' });
    expect(r.status).toBe(200);
    expect(r.body.marker).toBe('bold');
  });

  test('PUT /content validates body types', async () => {
    const missing = await request(app).put(`${BASE}/content`).set(AUTH).send({ path: '/x.html' });
    expect(missing.status).toBe(400);
    const wrongType = await request(app).put(`${BASE}/content`).set(AUTH).send({ path: '/x.html', content: { $gt: 1 } });
    expect(wrongType.status).toBe(400);
  });

  test('GET /content refuses binary files with 415', async () => {
    await fs.writeFile(path.join(rootA, 'bin.dat'), Buffer.from([0x89, 0x50, 0, 0x47]));
    const r = await request(app).get(`${BASE}/content?path=/bin.dat`).set(AUTH);
    expect(r.status).toBe(415);
    await fs.unlink(path.join(rootA, 'bin.dat'));
  });
});

describe('upload', () => {
  const accountTmp = () => path.join(os.tmpdir(), 'sahary-uploads', 'acct-a');

  test('single file lands in the target dir and staging is cleaned', async () => {
    const r = await request(app)
      .post(`${BASE}/upload?path=/docs`)
      .set(AUTH)
      .attach('files', Buffer.from('upload me'), 'up.txt');
    expect(r.status).toBe(200);
    expect(r.body.data.uploaded).toEqual([{ name: 'up.txt', size: 9 }]);
    await expect(fs.readFile(path.join(rootA, 'docs', 'up.txt'), 'utf8')).resolves.toBe('upload me');
    await waitFor(() => dirIsEmptyOrGone(accountTmp()));
    await fs.unlink(path.join(rootA, 'docs', 'up.txt'));
  });

  test('multiple files in one request', async () => {
    const r = await request(app)
      .post(`${BASE}/upload?path=/`)
      .set(AUTH)
      .attach('files', Buffer.from('1'), 'm1.txt')
      .attach('files', Buffer.from('22'), 'm2.txt');
    expect(r.status).toBe(200);
    expect(r.body.data.uploaded).toHaveLength(2);
    await fs.unlink(path.join(rootA, 'm1.txt'));
    await fs.unlink(path.join(rootA, 'm2.txt'));
  });

  test('409 without overwrite, replaced with ?overwrite=true', async () => {
    await request(app).post(`${BASE}/upload`).set(AUTH).attach('files', Buffer.from('v1'), 'dup.txt');
    const conflict = await request(app).post(`${BASE}/upload`).set(AUTH).attach('files', Buffer.from('v2'), 'dup.txt');
    expect(conflict.status).toBe(409);
    await expect(fs.readFile(path.join(rootA, 'dup.txt'), 'utf8')).resolves.toBe('v1');

    const ok = await request(app).post(`${BASE}/upload?overwrite=true`).set(AUTH).attach('files', Buffer.from('v2'), 'dup.txt');
    expect(ok.status).toBe(200);
    await expect(fs.readFile(path.join(rootA, 'dup.txt'), 'utf8')).resolves.toBe('v2');
    await fs.unlink(path.join(rootA, 'dup.txt'));
  });

  test('invalid original name is rejected and nothing lands', async () => {
    const r = await request(app)
      .post(`${BASE}/upload`)
      .set(AUTH)
      .attach('files', Buffer.from('x'), 'bad:name.txt');
    expect(r.status).toBe(400);
    expect((await fs.readdir(rootA)).filter((n) => n.includes('name'))).toEqual([]);
    await waitFor(() => dirIsEmptyOrGone(accountTmp()));
  });

  test('file exceeding the per-file size limit yields 413', async () => {
    process.env.HOSTING_UPLOAD_MAX_MB = '1';
    try {
      const over = Buffer.alloc(1024 * 1024 + 10, 66);
      const r = await request(app).post(`${BASE}/upload`).set(AUTH).attach('files', over, 'big.bin');
      expect(r.status).toBe(413);
      await waitFor(() => dirIsEmptyOrGone(accountTmp()));
    } finally {
      delete process.env.HOSTING_UPLOAD_MAX_MB;
    }
  });

  test('more than 20 files in one request yields 400', async () => {
    let req = request(app).post(`${BASE}/upload`).set(AUTH);
    for (let i = 0; i < 21; i++) {
      req = req.attach('files', Buffer.from('x'), `f${i}.txt`);
    }
    const r = await req;
    expect(r.status).toBe(400);
  });

  test('a different multipart field is rejected with 400', async () => {
    const r = await request(app).post(`${BASE}/upload`).set(AUTH).attach('notfiles', Buffer.from('x'), 'x.txt');
    expect(r.status).toBe(400);
  });

  test('no file parts yields 400', async () => {
    const r = await request(app).post(`${BASE}/upload`).set(AUTH).field('note', 'hi');
    expect(r.status).toBe(400);
  });

  test('upload over the plan quota yields 413', async () => {
    const r = await request(app)
      .post(`${BASE}/upload`)
      .set('x-test-user', 'quota-full')
      .attach('files', Buffer.from('x'), 'q.txt');
    expect(r.status).toBe(413);
    expect(r.body.message).toBe('Not enough disk space (plan limit 0 GB)');
  });

  test('client abort mid-upload leaves no staged temp files behind', async () => {
    // Real socket abort: write the multipart head + part of a large file,
    // wait until multer has staged bytes on disk, then destroy the request.
    const http = require('http');
    const server = app.listen(0);
    const { port } = server.address() as { port: number };
    const boundary = '----wp04boundary';
    const head = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="big.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.alloc(2 * 1024 * 1024, 0x61);
    const contentLength = Buffer.byteLength(head) + payload.length + Buffer.byteLength(tail);
    try {
      await new Promise<void>((resolve) => {
        const req = http.request({
          host: '127.0.0.1',
          port,
          path: `${BASE}/upload`,
          method: 'POST',
          headers: {
            'x-test-user': 'user-a',
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'content-length': contentLength,
          },
        });
        req.on('error', () => {});
        req.write(head);
        req.write(payload.subarray(0, payload.length / 2));
        // Wait until multer has staged bytes on disk, then abort.
        void waitForBool(async () => !(await dirIsEmptyOrGone(accountTmp())), 3000)
          .then((appeared) => {
            expect(appeared).toBe(true);
            req.destroy();
            resolve();
          });
      });
      // After the abort, both multer's abort cleanup and the res 'close'
      // sweep must leave nothing behind.
      await waitFor(() => dirIsEmptyOrGone(accountTmp()), 5000);
    } finally {
      await new Promise<void>((r) => { server.close(() => r()); });
    }
  });
});
