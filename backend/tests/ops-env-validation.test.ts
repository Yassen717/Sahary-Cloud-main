// Conditional env rules: MYSQL enabled requires ADMIN_URL, SSL enabled
// requires LETSENCRYPT_EMAIL, pureftpd requires the PureDB file paths, and
// HOSTING_ALLOW_UNPAID_ACCOUNTS=true must abort boot in production.

const { envSchema, validateEnv } = require('../src/config/env.validation');

const BASE_ENV = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
  SESSION_SECRET: 'z'.repeat(32),
};

const errorsFor = (env: Record<string, string>) =>
  (envSchema.validate({ ...BASE_ENV, ...env }).error?.details ?? []).map(
    (d: { context?: { key?: string }; message: string }) => ({
      key: d.context?.key,
      message: d.message,
    }),
  );

describe('conditional env rules (schema)', () => {
  test('HOSTING_MYSQL_ENABLED=true requires HOSTING_MYSQL_ADMIN_URL', () => {
    const errors = errorsFor({ HOSTING_MYSQL_ENABLED: 'true' });
    expect(errors).toContainEqual(
      expect.objectContaining({ key: 'HOSTING_MYSQL_ADMIN_URL' }),
    );
    expect(
      errors.find((e: { key?: string }) => e.key === 'HOSTING_MYSQL_ADMIN_URL').message,
    ).toContain('required');
  });

  test('HOSTING_MYSQL_ENABLED=true accepts a configured ADMIN_URL', () => {
    const errors = errorsFor({
      HOSTING_MYSQL_ENABLED: 'true',
      HOSTING_MYSQL_ADMIN_URL: 'mysql://sahary:secret@localhost:3306/mysql',
    });
    expect(errors.find((e: { key?: string }) => e.key === 'HOSTING_MYSQL_ADMIN_URL')).toBeUndefined();
  });

  test('HOSTING_MYSQL_ENABLED=false leaves ADMIN_URL optional', () => {
    const errors = errorsFor({ HOSTING_MYSQL_ENABLED: 'false' });
    expect(errors.find((e: { key?: string }) => e.key === 'HOSTING_MYSQL_ADMIN_URL')).toBeUndefined();
  });

  test('HOSTING_SSL_ENABLED=true requires HOSTING_LETSENCRYPT_EMAIL', () => {
    const errors = errorsFor({ HOSTING_SSL_ENABLED: 'true' });
    expect(errors).toContainEqual(
      expect.objectContaining({ key: 'HOSTING_LETSENCRYPT_EMAIL' }),
    );
  });

  test('HOSTING_SSL_ENABLED=true rejects a malformed email', () => {
    const errors = errorsFor({
      HOSTING_SSL_ENABLED: 'true',
      HOSTING_LETSENCRYPT_EMAIL: 'not-an-email',
    });
    expect(errors).toContainEqual(
      expect.objectContaining({ key: 'HOSTING_LETSENCRYPT_EMAIL' }),
    );
  });

  test('HOSTING_SSL_ENABLED=true accepts a real email', () => {
    const errors = errorsFor({
      HOSTING_SSL_ENABLED: 'true',
      HOSTING_LETSENCRYPT_EMAIL: 'ops@sahary.cloud',
    });
    expect(
      errors.find((e: { key?: string }) => e.key === 'HOSTING_LETSENCRYPT_EMAIL'),
    ).toBeUndefined();
  });

  test('HOSTING_FTP_DRIVER=pureftpd requires both PureDB paths', () => {
    const errors = errorsFor({ HOSTING_FTP_DRIVER: 'pureftpd' });
    expect(errors).toContainEqual(
      expect.objectContaining({ key: 'HOSTING_FTP_PASSWD_FILE' }),
    );
    expect(errors).toContainEqual(
      expect.objectContaining({ key: 'HOSTING_FTP_PDB_FILE' }),
    );
  });

  test('HOSTING_FTP_DRIVER=pureftpd accepts explicit paths', () => {
    const errors = errorsFor({
      HOSTING_FTP_DRIVER: 'pureftpd',
      HOSTING_FTP_PASSWD_FILE: '/etc/pure-ftpd/pureftpd.passwd',
      HOSTING_FTP_PDB_FILE: '/etc/pure-ftpd/pureftpd.pdb',
    });
    expect(errors.find((e: { key?: string }) => e.key === 'HOSTING_FTP_PASSWD_FILE')).toBeUndefined();
    expect(errors.find((e: { key?: string }) => e.key === 'HOSTING_FTP_PDB_FILE')).toBeUndefined();
  });

  test('HOSTING_FTP_DRIVER=none keeps the paths optional with defaults', () => {
    const errors = errorsFor({ HOSTING_FTP_DRIVER: 'none' });
    expect(errors.find((e: { key?: string }) => e.key === 'HOSTING_FTP_PASSWD_FILE')).toBeUndefined();
  });
});

describe('HOSTING_ALLOW_UNPAID_ACCOUNTS production guard (validateEnv)', () => {
  let envBackup: NodeJS.ProcessEnv;
  let exitSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const PROD_ENV: Record<string, string> = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    SESSION_SECRET: 'z'.repeat(32),
    SMTP_USER: 'ops@example.com',
    SMTP_PASS: 'smtp-pass',
    STRIPE_SECRET_KEY: 'sk_live_abc123',
    STRIPE_PUBLISHABLE_KEY: 'pk_live_abc123',
    STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
  };

  beforeEach(() => {
    envBackup = { ...process.env };
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) delete process.env[key];
    }
    Object.assign(process.env, envBackup);
  });

  test('fails validation in production with a clear message', () => {
    Object.assign(process.env, PROD_ENV, { HOSTING_ALLOW_UNPAID_ACCOUNTS: 'true' });

    expect(() => validateEnv()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(printed).toContain('HOSTING_ALLOW_UNPAID_ACCOUNTS');
    expect(printed).toContain('must not be enabled in production');
  });

  test('passes in production when the flag is not set / false', () => {
    Object.assign(process.env, PROD_ENV, { HOSTING_ALLOW_UNPAID_ACCOUNTS: 'false' });

    expect(() => validateEnv()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('is allowed outside production (dev/test escape hatch)', () => {
    Object.assign(process.env, PROD_ENV, {
      NODE_ENV: 'test',
      HOSTING_ALLOW_UNPAID_ACCOUNTS: 'true',
    });

    expect(() => validateEnv()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
