// Proves ENABLE_VPS=false behavior: the VM/Docker routers are not mounted
// (explicit 404), /health reports docker:'disabled' and exposes the hosting
// subsystem checks, and hosting problems degrade the status without ever
// turning /health into a 503.
//
// src/index.ts reads ENABLE_VPS at module load, so the app is re-required in
// an isolated module registry per scenario. tests/setup.ts sets the flag to
// 'true' globally — this suite flips it per load.

const fs = require('fs');
const os = require('os');
const request = require('supertest');

const ENV_KEYS = [
  'ENABLE_VPS',
  'HOSTING_NGINX_ENABLED',
  'HOSTING_MYSQL_ENABLED',
  'HOSTING_SSL_ENABLED',
  'HOSTING_FTP_DRIVER',
  'HOSTING_WWW_BASE',
];

const savedEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  jest.resetModules();
});

const loadApp = (env: Record<string, string>, customize?: () => void) => {
  let app: any;
  jest.isolateModules(() => {
    for (const [key, value] of Object.entries(env)) {
      process.env[key] = value;
    }
    if (customize) customize();
    // eslint-disable-next-line global-require
    app = require('../src/index');
  });
  return app;
};

describe('ENABLE_VPS=false', () => {
  test('VM and Docker API prefixes return a 404 "not enabled" JSON', async () => {
    const app = loadApp({ ENABLE_VPS: 'false' });

    for (const path of [
      '/api/v1/vms',
      '/api/v1/vms/abc123',
      '/api/v1/docker',
      '/api/v1/docker/containers',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, message: 'VPS hosting is not enabled' });
    }

    const postRes = await request(app).post('/api/v1/vms').send({});
    expect(postRes.status).toBe(404);
    expect(postRes.body.message).toBe('VPS hosting is not enabled');
  });

  test('/health reports docker disabled and all hosting checks disabled by default', async () => {
    const app = loadApp({ ENABLE_VPS: 'false' });

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.docker).toBe('disabled');
    expect(res.body.hosting).toBeDefined();
    expect(res.body.hosting.nginx).toBe('disabled');
    expect(res.body.hosting.mysql).toBe('disabled');
    expect(res.body.hosting.ftp).toBe('disabled');
    expect(res.body.hosting.ssl).toBe('disabled');
  });

  test('/health reports disk free GB from statfs on HOSTING_WWW_BASE', async () => {
    const app = loadApp({ ENABLE_VPS: 'false', HOSTING_WWW_BASE: os.tmpdir() });

    let statfsWorks = true;
    try {
      await fs.promises.statfs(os.tmpdir());
    } catch {
      statfsWorks = false;
    }

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    if (statfsWorks) {
      expect(typeof res.body.hosting.disk).toBe('number');
      expect(res.body.hosting.disk).toBeGreaterThanOrEqual(0);
    } else {
      expect(res.body.hosting.disk).toBeNull();
    }
  });

  test('a failing enabled hosting check degrades the status — never a 503', async () => {
    const app = loadApp({ ENABLE_VPS: 'false', HOSTING_MYSQL_ENABLED: 'true' }, () => {
      const mysql = require('../src/services/mysqlProvisionService');
      jest.spyOn(mysql, 'healthCheck').mockResolvedValue({ ok: false });
    });

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.hosting.mysql).toBe('error');
    expect(res.body.status).toBe('DEGRADED');
  });

  test('a throwing healthCheck reports error; ftp driver pure-ftpd enables the ftp check', async () => {
    const app = loadApp(
      {
        ENABLE_VPS: 'false',
        HOSTING_FTP_DRIVER: 'pureftpd',
        HOSTING_SSL_ENABLED: 'true',
      },
      () => {
        const ftp = require('../src/services/ftpService');
        jest.spyOn(ftp, 'healthCheck').mockResolvedValue({ ok: true });
        const ssl = require('../src/services/sslService');
        jest.spyOn(ssl, 'healthCheck').mockRejectedValue(new Error('certbot missing'));
      },
    );

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.hosting.ftp).toBe('ok');
    expect(res.body.hosting.ssl).toBe('error');
    expect(res.body.status).toBe('DEGRADED');
  });

  test('nginx check uses testConfig() and is cached for 60 seconds', async () => {
    let testConfigSpy: any;
    const app = loadApp({ ENABLE_VPS: 'false', HOSTING_NGINX_ENABLED: 'true' }, () => {
      const VhostService = require('../src/services/vhostService');
      testConfigSpy = jest.spyOn(VhostService, 'testConfig').mockResolvedValue(undefined);
    });

    const res1 = await request(app).get('/health');
    expect(res1.status).toBe(200);
    expect(res1.body.hosting.nginx).toBe('ok');
    expect(testConfigSpy).toHaveBeenCalledTimes(1);

    // Second call within the cache window must not re-run `nginx -t`.
    const res2 = await request(app).get('/health');
    expect(res2.body.hosting.nginx).toBe('ok');
    expect(testConfigSpy).toHaveBeenCalledTimes(1);
  });

  test('nginx testConfig failure reports error without reloading', async () => {
    let testConfigSpy: any;
    const app = loadApp({ ENABLE_VPS: 'false', HOSTING_NGINX_ENABLED: 'true' }, () => {
      const VhostService = require('../src/services/vhostService');
      testConfigSpy = jest
        .spyOn(VhostService, 'testConfig')
        .mockRejectedValue(new Error('nginx -t failed'));
      // Guard: a health probe must never attempt a reload.
      jest.spyOn(VhostService, 'testAndReload').mockRejectedValue(
        new Error('testAndReload must not be called from /health'),
      );
    });

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.hosting.nginx).toBe('error');
    expect(testConfigSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ENABLE_VPS=true', () => {
  test('VM router is mounted (rejects unauthorized instead of "not enabled")', async () => {
    const app = loadApp({ ENABLE_VPS: 'true' });

    const res = await request(app).get('/api/v1/vms');
    expect(res.status).not.toBe(404);
    expect(res.body.message).not.toBe('VPS hosting is not enabled');
  });
});
