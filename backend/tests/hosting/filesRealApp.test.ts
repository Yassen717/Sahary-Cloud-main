import fs from 'fs/promises';
import os from 'os';
import path from 'path';

/**
 * Real-app-stack test: the actual express app (src/index.ts), the real
 * global sanitizers, real authenticate/requireEmailVerification/
 * requireHostingAccount against the test database, real route ordering in
 * routes/hosting.ts. Proves PUT /api/v1/hosting/files/content delivers HTML —
 * including script tags — byte-for-byte despite every sanitizer in the stack.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../../src/index');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../../src/config/database');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JWTUtils = require('../../src/utils/jwt').default;

const BASE = '/api/v1/hosting/files';

const run = `wp04-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const EMAIL = `wp04-files-${run}@example.test`;
const PLAN_NAME = `wp04-plan-${run}`;
const DOMAIN = `wp04-${run}.files.test`;

let docRoot: string;
let token: string;
let userId: string;
let accountId: string;
let planId: string;

beforeAll(async () => {
  docRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sahary-wp04-real-'));

  const plan = await prisma.hostingPlan.create({
    data: { name: PLAN_NAME, diskGB: 5, bandwidthGB: 100 },
  });
  planId = plan.id;

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      password: 'not-a-real-hash',
      firstName: 'WP04',
      lastName: 'Files',
      isVerified: true,
    },
  });
  userId = user.id;

  const account = await prisma.hostingAccount.create({
    data: {
      domain: DOMAIN,
      documentRoot: docRoot,
      diskQuota: 5,
      bandwidthQuota: 100,
      status: 'ACTIVE',
      userId,
      planId,
    },
  });
  accountId = account.id;

  token = JWTUtils.generateAccessToken({ userId, email: EMAIL, role: 'USER' });
});

afterAll(async () => {
  await prisma.hostingAccount.deleteMany({ where: { id: accountId } }).catch(() => {});
  await prisma.hostingPlan.deleteMany({ where: { id: planId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
  await fs.rm(docRoot, { recursive: true, force: true });
});

describe('real stack: PUT /hosting/files/content sanitizer exemption', () => {
  test('HTML with script tags round-trips byte-for-byte through the real app', async () => {
    const html = [
      '<!doctype html>',
      '<html><head><title>t</title></head><body>',
      '<script>alert("xss")</script>',
      '<img src=x onerror="fetch(evil)">',
      '<p>café € — multibyte</p>',
      '</body></html>',
    ].join('\n');

    const w = await request(app)
      .put(`${BASE}/content`)
      .set('Authorization', `Bearer ${token}`)
      .send({ path: '/page.html', content: html });
    expect(w.status).toBe(200);
    expect(w.body.success).toBe(true);
    await expect(fs.readFile(path.join(docRoot, 'page.html'), 'utf8')).resolves.toBe(html);

    const r = await request(app)
      .get(`${BASE}/content`)
      .query({ path: '/page.html' })
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.data.content).toBe(html);
  });

  test('the same script payload on a non-exempt files route is still rejected', async () => {
    // Negative control: sanitizers ARE active for everything else — only
    // PUT /files/content is exempt.
    const r = await request(app)
      .post(`${BASE}/mkdir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ path: '/', name: '<script>alert(1)</script>' });
    expect(r.status).toBe(400);
  });

  test('unauthenticated requests get 401 from the real auth middleware', async () => {
    const r = await request(app).get(`${BASE}?path=/`);
    expect(r.status).toBe(401);
  });
});
