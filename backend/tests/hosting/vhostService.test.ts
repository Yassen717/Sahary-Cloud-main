import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { prisma } from '../../src/config/database';
import {
  buildVhostConfig,
  removeAccountVhost,
  syncAccountVhost,
} from '../../src/services/vhostService';
import type { BuildVhostConfigInput } from '../../src/services/vhostService';
import { _resetWildcardCache } from '../../src/services/sslService';

// child_process.execFile is not redefinable via spyOn on this Node version, so
// the whole module is replaced — the service still calls execFile(bin, argv,
// opts, cb) exactly the same way.
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return { ...actual, execFile: jest.fn() };
});

const execMock = execFile as unknown as jest.Mock;

// Temp paths that end up inside generated nginx config must be free of
// whitespace/`;`/`{}`/`$` — os.tmpdir() on this host contains a space, so the
// suite roots itself inside the worktree instead.
const SUITE_TMP = path.join(__dirname, 'tmp-vhost');
const CERT_FIXTURE = path.join(__dirname, 'fixtures', 'test-cert.pem');
const KEY_FIXTURE = path.join(__dirname, 'fixtures', 'test-key.pem');

const ENV_KEYS = [
  'HOSTING_NGINX_ENABLED',
  'HOSTING_NGINX_SITES_AVAILABLE',
  'HOSTING_NGINX_SITES_ENABLED',
  'HOSTING_NGINX_STAGING_DIR',
  'HOSTING_NGINX_LOG_DIR',
  'HOSTING_ACME_WEBROOT',
  'HOSTING_LETSENCRYPT_LIVE_DIR',
  'HOSTING_WWW_BASE',
  'HOSTING_WILDCARD_CERT_PATH',
  'HOSTING_WILDCARD_KEY_PATH',
  'HOSTING_SSL_ENABLED',
  'HOSTING_LETSENCRYPT_EMAIL',
];

let savedEnv: Record<string, string | undefined> = {};
let tmpDir = '';

type ExecCb = (e: Error | null, so: string, se: string) => void;

const setNginxEnv = (enabled: boolean): void => {
  process.env.HOSTING_NGINX_ENABLED = enabled ? 'true' : 'false';
  process.env.HOSTING_NGINX_SITES_AVAILABLE = path.join(tmpDir, 'sites-available');
  process.env.HOSTING_NGINX_SITES_ENABLED = path.join(tmpDir, 'sites-enabled');
  process.env.HOSTING_NGINX_STAGING_DIR = path.join(tmpDir, 'sites-staging');
  process.env.HOSTING_NGINX_LOG_DIR = path.join(tmpDir, 'logs');
  process.env.HOSTING_ACME_WEBROOT = path.join(tmpDir, 'acme');
  process.env.HOSTING_LETSENCRYPT_LIVE_DIR = path.join(tmpDir, 'live');
  process.env.HOSTING_WWW_BASE = path.join(tmpDir, 'www');
  process.env.HOSTING_WILDCARD_CERT_PATH = '';
  process.env.HOSTING_WILDCARD_KEY_PATH = '';
};

const mockNginxOk = (): void => {
  execMock.mockImplementation((_f: string, _a: string[], _o: unknown, cb: ExecCb) => {
    cb(null, 'ok', '');
    return { kill: () => undefined };
  });
};

const mockNginxFailsTest = (): void => {
  execMock.mockImplementation((_f: string, args: string[], _o: unknown, cb: ExecCb) => {
    if (args[0] === '-t') {
      cb(Object.assign(new Error('nginx -t failed'), { code: 1 }), '', 'syntax error in conf');
      return { kill: () => undefined };
    }
    cb(null, '', '');
    return { kill: () => undefined };
  });
};

const status = (err: unknown): number | undefined => (err as { status?: number }).status;

const readAvailable = async (domain: string): Promise<string> =>
  fsp.readFile(path.join(tmpDir, 'sites-available', `${domain}.conf`), 'utf8');

// ─── DB seed helpers ────────────────────────────────────────────────────────

const createdUserIds: string[] = [];
const createdPlanIds: string[] = [];

const newId = (): string => crypto.randomUUID().replace(/-/g, '');

const seedPlan = async (): Promise<string> => {
  const plan = await prisma.hostingPlan.create({
    data: {
      name: `wp05-plan-${newId().slice(0, 12)}`,
      diskGB: 10,
      bandwidthGB: 100,
      monthlyPrice: 5,
    },
  });
  createdPlanIds.push(plan.id);
  return plan.id;
};

const seedUser = async (): Promise<string> => {
  const user = await prisma.user.create({
    data: {
      email: `wp05v-${newId().slice(0, 12)}@example.test`,
      password: 'x',
      firstName: 'T',
      lastName: 'U',
      isVerified: true,
    },
  });
  createdUserIds.push(user.id);
  return user.id;
};

const seedAccount = async (opts: {
  domain: string;
  status?: string;
  sslEnabled?: boolean;
  sslExpiresAt?: Date | null;
}): Promise<{ id: string; domain: string; documentRoot: string }> => {
  const [planId, userId] = await Promise.all([seedPlan(), seedUser()]);
  const accountId = newId();
  const documentRoot = path.join(tmpDir, 'www', accountId, 'public_html');
  const account = await prisma.hostingAccount.create({
    data: {
      id: accountId,
      domain: opts.domain,
      documentRoot,
      diskQuota: 10,
      bandwidthQuota: 100,
      status: opts.status ?? 'ACTIVE',
      sslEnabled: opts.sslEnabled ?? false,
      sslExpiresAt: opts.sslExpiresAt ?? null,
      userId,
      planId,
    },
  });
  return { id: account.id, domain: account.domain, documentRoot };
};

const seedDomain = async (accountId: string, opts: {
  domain: string;
  isVerified?: boolean;
  sslStatus?: string;
}): Promise<string> => {
  const record = await prisma.hostingDomain.create({
    data: {
      domain: opts.domain,
      accountId,
      isVerified: opts.isVerified ?? true,
      verifyToken: 'tok',
      sslStatus: opts.sslStatus ?? 'NONE',
      sslEnabled: opts.sslStatus === 'ACTIVE',
    },
  });
  return record.id;
};

// ─── buildVhostConfig (pure) ────────────────────────────────────────────────

const baseInput = (): BuildVhostConfigInput => ({
  primaryDomain: 'acct1.sahary.cloud',
  documentRoot: '/var/www/aa11bb/public_html',
  accountId: 'aa11bb',
  suspended: false,
  acmeWebroot: '/var/www/_acme',
  logDir: '/var/log/nginx/sahary',
  suspendedPagePath: '/var/www/_system/suspended.html',
  primaryTls: null,
  customDomains: [],
});

const blockCount = (config: string): number => config.split('server {').length - 1;

describe('buildVhostConfig', () => {
  test('HTTP-only primary: one :80 block with access_log, root, acme, headers, dotfile deny', () => {
    const out = buildVhostConfig(baseInput());
    expect(blockCount(out)).toBe(1);
    expect(out).toContain('listen 80;');
    expect(out).toContain('listen [::]:80;');
    expect(out).toContain('server_name acct1.sahary.cloud;');
    expect(out).toContain('access_log /var/log/nginx/sahary/aa11bb.access.log sahary_bytes;');
    expect(out).toContain('root /var/www/aa11bb/public_html;');
    expect(out).toContain('index index.html index.htm;');
    expect(out).toContain('try_files $uri $uri/ =404;');
    expect(out).toContain('location ^~ /.well-known/acme-challenge/ {\n        root /var/www/_acme;');
    expect(out).toContain('location ~ /\\.(?!well-known) {\n        deny all;');
    expect(out).toContain('add_header X-Content-Type-Options nosniff;');
    expect(out).toContain('add_header X-Frame-Options SAMEORIGIN;');
    expect(out).toContain('add_header Referrer-Policy same-origin;');
    expect(out).not.toContain('listen 443');
    expect(out).not.toContain('return 301');
  });

  test('wildcard TLS on primary: :80 redirects to https (except ACME) + :443 ssl block', () => {
    const out = buildVhostConfig({
      ...baseInput(),
      primaryTls: { certificatePath: '/etc/ssl/sahary/fullchain.pem', keyPath: '/etc/ssl/sahary/privkey.pem' },
    });
    expect(blockCount(out)).toBe(2);
    expect(out).toContain('return 301 https://$host$request_uri;');
    expect(out).toContain('listen 443 ssl;');
    expect(out).toContain('listen [::]:443 ssl;');
    expect(out).toContain('ssl_certificate /etc/ssl/sahary/fullchain.pem;');
    expect(out).toContain('ssl_certificate_key /etc/ssl/sahary/privkey.pem;');
    expect(out).toContain('ssl_protocols TLSv1.2 TLSv1.3;');
    expect(out).toContain('add_header Strict-Transport-Security "max-age=31536000" always;');
    // ACME challenge must NOT be redirected — served from the webroot.
    const port80Block = out.split('server {')[1];
    expect(port80Block).toContain('location ^~ /.well-known/acme-challenge/');
    expect(port80Block).toContain('return 301');
  });

  test('verified custom domain without cert gets its own HTTP-only block', () => {
    const out = buildVhostConfig({
      ...baseInput(),
      customDomains: [{ domain: 'custom.example.test', tls: null }],
    });
    expect(blockCount(out)).toBe(2);
    expect(out).toContain('server_name custom.example.test;');
    const customBlock = out.split('server {')[2];
    expect(customBlock).toContain('try_files $uri $uri/ =404;');
    expect(customBlock).toContain('access_log /var/log/nginx/sahary/aa11bb.access.log sahary_bytes;');
    expect(customBlock).toContain('location ^~ /.well-known/acme-challenge/');
    expect(customBlock).not.toContain('listen 443');
  });

  test('custom domain with usable cert gets redirect + 443 blocks', () => {
    const out = buildVhostConfig({
      ...baseInput(),
      customDomains: [{
        domain: 'custom.example.test',
        tls: {
          certificatePath: '/etc/letsencrypt/live/custom.example.test/fullchain.pem',
          keyPath: '/etc/letsencrypt/live/custom.example.test/privkey.pem',
        },
      }],
    });
    expect(blockCount(out)).toBe(3);
    expect(out).toContain('ssl_certificate /etc/letsencrypt/live/custom.example.test/fullchain.pem;');
    expect(out).toContain('ssl_certificate_key /etc/letsencrypt/live/custom.example.test/privkey.pem;');
  });

  test('suspended: every block returns 503 with the suspended page; ACME still served; no redirects', () => {
    const out = buildVhostConfig({
      ...baseInput(),
      suspended: true,
      primaryTls: { certificatePath: '/etc/ssl/sahary/fullchain.pem', keyPath: '/etc/ssl/sahary/privkey.pem' },
      customDomains: [{ domain: 'custom.example.test', tls: null }],
    });
    expect(blockCount(out)).toBe(3);
    expect(out).not.toContain('return 301');
    expect(out).not.toContain('try_files');
    expect(out).toContain('return 503;');
    expect(out).toContain('error_page 503 /__suspended.html;');
    expect(out).toContain('alias /var/www/_system/suspended.html;');
    expect(out).toContain('internal;');
    expect(out).toContain('location ^~ /.well-known/acme-challenge/');
    expect(out).toContain('ssl_certificate /etc/ssl/sahary/fullchain.pem;');
  });

  test('multiple custom domains are deduped, sorted, and skip the primary', () => {
    const out = buildVhostConfig({
      ...baseInput(),
      customDomains: [
        { domain: 'zzz.example.test', tls: null },
        { domain: 'acct1.sahary.cloud', tls: null },
        { domain: 'aaa.example.test', tls: null },
        { domain: 'zzz.example.test', tls: null },
      ],
    });
    expect(blockCount(out)).toBe(3);
    expect(out.indexOf('server_name aaa.example.test;')).toBeLessThan(out.indexOf('server_name zzz.example.test;'));
  });

  test('hostile values are rejected with 400', () => {
    const expect400 = (input: BuildVhostConfigInput): void => {
      try {
        buildVhostConfig(input);
        throw new Error('did not throw');
      } catch (error) {
        expect(status(error)).toBe(400);
      }
    };

    expect400({ ...baseInput(), primaryDomain: 'evil.com;}' });
    expect400({ ...baseInput(), primaryDomain: 'bad domain.test' });
    expect400({ ...baseInput(), primaryDomain: 'multi\nline.example.test' });
    expect400({ ...baseInput(), primaryDomain: 'inject$.example.test' });
    expect400({ ...baseInput(), primaryDomain: 'not-a-domain' });
    expect400({ ...baseInput(), customDomains: [{ domain: 'evil{}.test', tls: null }] });
    expect400({ ...baseInput(), documentRoot: 'relative/path' });
    expect400({ ...baseInput(), documentRoot: '/var/www/has space/html' });
    expect400({ ...baseInput(), documentRoot: '/var/www/";evil/html' });
    expect400({ ...baseInput(), documentRoot: '/var/www/a{}/html' });
    expect400({ ...baseInput(), documentRoot: '/var/www/$x/html' });
    expect400({ ...baseInput(), accountId: 'BAD_ID!' });
    expect400({ ...baseInput(), logDir: 'relative/logs' });
    expect400({ ...baseInput(), acmeWebroot: '/tmp/#comment' });
    expect400({
      ...baseInput(),
      suspended: true,
      suspendedPagePath: 'not/absolute/page.html',
    });
    expect400({
      ...baseInput(),
      primaryTls: { certificatePath: '/etc/ssl/ok.pem', keyPath: 'relative/key.pem' },
    });
  });
});

// ─── syncAccountVhost / removeAccountVhost (mocked nginx, temp dirs, real DB) ─

describe('syncAccountVhost', () => {
  beforeAll(async () => {
    fs.mkdirSync(SUITE_TMP, { recursive: true });
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(SUITE_TMP, 'case-'));
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    setNginxEnv(true);
    _resetWildcardCache();
    mockNginxOk();
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    _resetWildcardCache();
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.hostingPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
    await fsp.rm(SUITE_TMP, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  test('nginx disabled -> {skipped:true}, no files, no exec calls', async () => {
    setNginxEnv(false);
    const result = await syncAccountVhost({
      primaryDomain: 'nobody.sahary.cloud',
      documentRoot: path.join(tmpDir, 'www', 'aa11bb', 'public_html'),
    });
    expect(result).toEqual({ skipped: true });
    expect(execMock).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tmpDir, 'sites-available'))).toBe(false);
  });

  test('invalid inputs rejected before touching disk', async () => {
    await expect(syncAccountVhost({ primaryDomain: 'not a domain', documentRoot: '/var/www/aa11bb/public_html' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(syncAccountVhost({ primaryDomain: 'ok.example.test', documentRoot: 'relative/dir' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(syncAccountVhost({ primaryDomain: 'ok.example.test', documentRoot: '/var/www/has space/html' }))
      .rejects.toMatchObject({ status: 400 });
    // docroot whose parent dir is not a safe account id
    await expect(syncAccountVhost({ primaryDomain: 'ok.example.test', documentRoot: '/var/www/Bad_Name/html' }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('no account row -> HTTP-only config built purely from arguments', async () => {
    const documentRoot = path.join(tmpDir, 'www', 'aa11bb', 'public_html');
    const result = await syncAccountVhost({
      primaryDomain: 'ghost.sahary.cloud',
      customDomains: ['extra.example.test'],
      documentRoot,
    });
    expect(result.skipped).toBe(false);
    const conf = await readAvailable('ghost.sahary.cloud');
    expect(conf).toContain('server_name ghost.sahary.cloud;');
    expect(conf).toContain('server_name extra.example.test;');
    expect(conf).not.toContain('listen 443');
    expect(conf).toContain(`access_log ${path.join(tmpDir, 'logs')}/aa11bb.access.log sahary_bytes;`);
  });

  test('account ACTIVE without wildcard or custom certs -> HTTP-only blocks', async () => {
    const account = await seedAccount({ domain: 'act1.sahary.cloud' });
    await seedDomain(account.id, { domain: 'cust1.example.test', isVerified: true, sslStatus: 'NONE' });
    await seedDomain(account.id, { domain: 'unv1.example.test', isVerified: false });

    const result = await syncAccountVhost({
      primaryDomain: 'act1.sahary.cloud',
      customDomains: [],
      documentRoot: account.documentRoot,
    });
    expect(result.skipped).toBe(false);
    const conf = await readAvailable('act1.sahary.cloud');
    expect(blockCount(conf)).toBe(2); // primary + verified custom only
    expect(conf).toContain('server_name cust1.example.test;');
    expect(conf).not.toContain('unv1.example.test');
    expect(conf).not.toContain('listen 443');
    expect(conf).not.toContain('return 503');
  });

  test('account + readable wildcard cert -> redirect + 443 block with wildcard paths', async () => {
    process.env.HOSTING_WILDCARD_CERT_PATH = CERT_FIXTURE;
    process.env.HOSTING_WILDCARD_KEY_PATH = KEY_FIXTURE;
    const account = await seedAccount({ domain: 'wild1.sahary.cloud' });

    await syncAccountVhost({
      primaryDomain: 'wild1.sahary.cloud',
      documentRoot: account.documentRoot,
    });
    const conf = await readAvailable('wild1.sahary.cloud');
    expect(blockCount(conf)).toBe(2);
    expect(conf).toContain('return 301 https://$host$request_uri;');
    expect(conf).toContain('listen 443 ssl;');
    expect(conf).toContain(`ssl_certificate ${CERT_FIXTURE};`);
    expect(conf).toContain('Strict-Transport-Security "max-age=31536000"');
  });

  test('verified custom domain with cert on disk gets TLS blocks', async () => {
    const account = await seedAccount({ domain: 'cust2.sahary.cloud' });
    await seedDomain(account.id, { domain: 'secured.example.test', isVerified: true, sslStatus: 'ACTIVE' });
    const liveDir = path.join(tmpDir, 'live', 'secured.example.test');
    fs.mkdirSync(liveDir, { recursive: true });
    fs.copyFileSync(CERT_FIXTURE, path.join(liveDir, 'fullchain.pem'));
    fs.copyFileSync(KEY_FIXTURE, path.join(liveDir, 'privkey.pem'));

    await syncAccountVhost({
      primaryDomain: 'cust2.sahary.cloud',
      documentRoot: account.documentRoot,
    });
    const conf = await readAvailable('cust2.sahary.cloud');
    expect(blockCount(conf)).toBe(3); // primary :80 + custom :80 redirect + custom :443
    const expectedCert = `${path.join(tmpDir, 'live')}/secured.example.test/fullchain.pem`;
    expect(conf).toContain(`ssl_certificate ${expectedCert};`);
    // custom domain block redirects; its 443 sibling serves
    const customRedirect = conf.split('server {')[2];
    expect(customRedirect).toContain('server_name secured.example.test;');
    expect(customRedirect).toContain('return 301');
  });

  test('ACTIVE-status domain without cert file on disk stays HTTP-only', async () => {
    const account = await seedAccount({ domain: 'cust3.sahary.cloud' });
    await seedDomain(account.id, { domain: 'missing.example.test', isVerified: true, sslStatus: 'ACTIVE' });

    await syncAccountVhost({
      primaryDomain: 'cust3.sahary.cloud',
      documentRoot: account.documentRoot,
    });
    const conf = await readAvailable('cust3.sahary.cloud');
    expect(conf).toContain('server_name missing.example.test;');
    expect(conf).not.toContain('ssl_certificate');
  });

  test('SUSPENDED account: all blocks 503 via bilingual suspended page, ACME kept', async () => {
    const account = await seedAccount({ domain: 'susp1.sahary.cloud', status: 'SUSPENDED' });
    await seedDomain(account.id, { domain: 'sp.example.test', isVerified: true });

    await syncAccountVhost({
      primaryDomain: 'susp1.sahary.cloud',
      documentRoot: account.documentRoot,
    });
    const conf = await readAvailable('susp1.sahary.cloud');
    expect(conf).toContain('return 503;');
    expect(conf).toContain('error_page 503 /__suspended.html;');
    expect(conf).toContain('internal;');
    expect(conf).not.toContain('return 301');
    expect(conf).not.toContain('try_files');

    const pagePath = path.join(tmpDir, 'www', '_system', 'suspended.html');
    const page = fs.readFileSync(pagePath, 'utf8');
    expect(page).toContain('Account suspended');
    expect(page).toContain('dir="rtl"');
    expect(page).toContain('تم تعليق الحساب');
    const aliasTarget = `${path.join(tmpDir, 'www')}/_system/suspended.html`;
    expect(conf).toContain(`alias ${aliasTarget};`);
  });

  test('candidate config is staged, tested, then enabled (copy fallback on this host)', async () => {
    const account = await seedAccount({ domain: 'staged.sahary.cloud' });
    await syncAccountVhost({ primaryDomain: 'staged.sahary.cloud', documentRoot: account.documentRoot });

    // Staging copy was removed after a successful nginx -t.
    expect(fs.readdirSync(path.join(tmpDir, 'sites-staging'))).toHaveLength(0);
    const enabled = path.join(tmpDir, 'sites-enabled', 'staged.sahary.cloud.conf');
    expect(fs.existsSync(enabled)).toBe(true);
    const enabledContent = fs.readFileSync(enabled, 'utf8');
    expect(enabledContent).toBe(await readAvailable('staged.sahary.cloud'));
    // nginx -t ran at least twice: staged candidate + post-enable verify.
    const testCalls = execMock.mock.calls.filter((call: unknown[]) => (call[1] as string[])[0] === '-t');
    expect(testCalls.length).toBeGreaterThanOrEqual(2);
  });

  test('failed sync rolls back to the previous known-good config', async () => {
    const account = await seedAccount({ domain: 'rb1.sahary.cloud' });
    await syncAccountVhost({ primaryDomain: 'rb1.sahary.cloud', documentRoot: account.documentRoot });
    const goodConfig = await readAvailable('rb1.sahary.cloud');
    const enabledPath = path.join(tmpDir, 'sites-enabled', 'rb1.sahary.cloud.conf');
    expect(fs.existsSync(enabledPath)).toBe(true);

    // Suspend the account -> next sync writes a different config, then nginx -t fails.
    await prisma.hostingAccount.update({ where: { id: account.id }, data: { status: 'SUSPENDED' } });
    mockNginxFailsTest();
    await expect(
      syncAccountVhost({ primaryDomain: 'rb1.sahary.cloud', documentRoot: account.documentRoot }),
    ).rejects.toMatchObject({ status: 502 });

    // sites-available restored, enabled entry re-created with the old content.
    expect(await readAvailable('rb1.sahary.cloud')).toBe(goodConfig);
    expect(fs.existsSync(enabledPath)).toBe(true);
    expect(fs.readFileSync(enabledPath, 'utf8')).toBe(goodConfig);
    expect(fs.readdirSync(path.join(tmpDir, 'sites-staging'))).toHaveLength(0);
  });

  test('failed first sync removes the candidate and leaves nothing enabled', async () => {
    mockNginxFailsTest();
    const documentRoot = path.join(tmpDir, 'www', 'cc22dd', 'public_html');
    await expect(
      syncAccountVhost({ primaryDomain: 'new1.sahary.cloud', documentRoot }),
    ).rejects.toMatchObject({ status: 502 });
    expect(fs.existsSync(path.join(tmpDir, 'sites-available', 'new1.sahary.cloud.conf'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'sites-enabled', 'new1.sahary.cloud.conf'))).toBe(false);
  });

  test('removeAccountVhost deletes both entries and reloads', async () => {
    const account = await seedAccount({ domain: 'gone1.sahary.cloud' });
    await syncAccountVhost({ primaryDomain: 'gone1.sahary.cloud', documentRoot: account.documentRoot });
    expect(fs.existsSync(path.join(tmpDir, 'sites-enabled', 'gone1.sahary.cloud.conf'))).toBe(true);

    execMock.mockClear();
    const result = await removeAccountVhost('gone1.sahary.cloud');
    expect(result).toEqual({
      skipped: false,
      configPath: path.join(tmpDir, 'sites-available', 'gone1.sahary.cloud.conf'),
      symlinkPath: path.join(tmpDir, 'sites-enabled', 'gone1.sahary.cloud.conf'),
    });
    expect(fs.existsSync(path.join(tmpDir, 'sites-available', 'gone1.sahary.cloud.conf'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'sites-enabled', 'gone1.sahary.cloud.conf'))).toBe(false);
    const reloadCalls = execMock.mock.calls.filter((call: unknown[]) => (call[1] as string[]).join(' ').includes('reload'));
    expect(reloadCalls.length).toBeGreaterThanOrEqual(1);
  });

  test('removeAccountVhost skipped mode + invalid domain', async () => {
    setNginxEnv(false);
    expect(await removeAccountVhost('x.sahary.cloud')).toEqual({ skipped: true });
    setNginxEnv(true);
    await expect(removeAccountVhost('bad domain')).rejects.toMatchObject({ status: 400 });
  });
});
