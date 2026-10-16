import { getHostingConfig } from '../../../src/config/hosting';

describe('getHostingConfig', () => {
  const KEYS = [
    'HOSTING_BASE_DOMAIN', 'HOSTING_WWW_BASE', 'HOSTING_TRASH_DIR',
    'HOSTING_ALLOW_UNPAID_ACCOUNTS', 'HOSTING_JOBS_ENABLED',
    'HOSTING_RETENTION_DAYS', 'HOSTING_SUSPENDED_RETENTION_DAYS', 'HOSTING_PAST_DUE_GRACE_DAYS',
    'HOSTING_NGINX_ENABLED', 'HOSTING_NGINX_SITES_AVAILABLE', 'HOSTING_NGINX_SITES_ENABLED',
    'HOSTING_NGINX_STAGING_DIR', 'HOSTING_NGINX_LOG_DIR',
    'HOSTING_MYSQL_ENABLED', 'HOSTING_MYSQL_ADMIN_URL', 'HOSTING_MYSQL_PUBLIC_HOST',
    'HOSTING_MYSQL_PUBLIC_PORT', 'HOSTING_MYSQL_USER_HOST',
    'HOSTING_FTP_DRIVER', 'HOSTING_FTP_PUBLIC_HOST', 'HOSTING_FTP_PORT',
    'HOSTING_FTP_SYSTEM_USER', 'HOSTING_FTP_SYSTEM_GROUP', 'HOSTING_FTP_PUREPW_BIN',
    'HOSTING_FTP_PASSWD_FILE', 'HOSTING_FTP_PDB_FILE',
    'HOSTING_SSL_ENABLED', 'HOSTING_CERTBOT_BIN', 'HOSTING_ACME_WEBROOT',
    'HOSTING_LETSENCRYPT_EMAIL', 'HOSTING_LETSENCRYPT_STAGING', 'HOSTING_LETSENCRYPT_LIVE_DIR',
    'HOSTING_WILDCARD_CERT_PATH', 'HOSTING_WILDCARD_KEY_PATH',
    'HOSTING_UPLOAD_MAX_MB', 'HOSTING_TEXT_EDIT_MAX_KB',
    'HOSTING_METER_CRON', 'HOSTING_SSL_CRON', 'HOSTING_RECONCILE_CRON', 'HOSTING_RETENTION_CRON',
  ];

  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  });

  test('returns contract defaults when env is unset', () => {
    const c = getHostingConfig({});
    expect(c.baseDomain).toBe('sahary.cloud');
    expect(c.wwwBase).toBe('/var/www');
    expect(c.trashDir).toBe('/var/www/.trash');
    expect(c.allowUnpaidAccounts).toBe(false);
    expect(c.jobsEnabled).toBe(true);
    expect(c.retentionDays).toBe(7);
    expect(c.suspendedRetentionDays).toBe(30);
    expect(c.pastDueGraceDays).toBe(7);
    expect(c.nginx).toEqual({
      enabled: false,
      sitesAvailable: '/etc/nginx/sites-available',
      sitesEnabled: '/etc/nginx/sites-enabled',
      stagingDir: '/etc/nginx/sites-staging',
      logDir: '/var/log/nginx/sahary',
    });
    expect(c.mysql).toEqual({
      enabled: false, adminUrl: '', publicHost: 'localhost', publicPort: 3306, userHost: '%',
    });
    expect(c.ftp.driver).toBe('none');
    expect(c.ftp.publicHost).toBe('ftp.sahary.cloud');
    expect(c.ftp.port).toBe(21);
    expect(c.ssl.enabled).toBe(false);
    expect(c.ssl.acmeWebroot).toBe('/var/www/_acme');
    expect(c.files).toEqual({ uploadMaxMB: 50, textEditMaxKB: 1024 });
    expect(c.cron).toEqual({
      meter: '0 * * * *',
      ssl: '*/10 * * * *',
      reconcile: '15 */6 * * *',
      retention: '30 3 * * *',
    });
  });

  test('honors env overrides', () => {
    const c = getHostingConfig({
      HOSTING_BASE_DOMAIN: 'example.com',
      HOSTING_WWW_BASE: '/srv/sites',
      HOSTING_ALLOW_UNPAID_ACCOUNTS: 'true',
      HOSTING_JOBS_ENABLED: 'false',
      HOSTING_RETENTION_DAYS: '14',
      HOSTING_NGINX_ENABLED: 'true',
      HOSTING_MYSQL_ENABLED: 'true',
      HOSTING_MYSQL_PUBLIC_PORT: '3307',
      HOSTING_FTP_DRIVER: 'pureftpd',
      HOSTING_FTP_PORT: '2121',
      HOSTING_SSL_ENABLED: 'true',
      HOSTING_UPLOAD_MAX_MB: '25',
      HOSTING_METER_CRON: '5 * * * *',
    } as NodeJS.ProcessEnv);
    expect(c.baseDomain).toBe('example.com');
    expect(c.trashDir).toBe('/srv/sites/.trash');
    expect(c.allowUnpaidAccounts).toBe(true);
    expect(c.jobsEnabled).toBe(false);
    expect(c.retentionDays).toBe(14);
    expect(c.nginx.enabled).toBe(true);
    expect(c.mysql.enabled).toBe(true);
    expect(c.mysql.publicPort).toBe(3307);
    expect(c.ftp.driver).toBe('pureftpd');
    expect(c.ftp.publicHost).toBe('ftp.example.com');
    expect(c.ftp.port).toBe(2121);
    expect(c.ssl.enabled).toBe(true);
    expect(c.files.uploadMaxMB).toBe(25);
    expect(c.cron.meter).toBe('5 * * * *');
  });

  test('ftp driver falls back to none for unknown values', () => {
    expect(getHostingConfig({ HOSTING_FTP_DRIVER: 'vsftpd' } as NodeJS.ProcessEnv).ftp.driver).toBe('none');
  });

  test('re-reads process.env on every call', () => {
    process.env.HOSTING_MYSQL_ENABLED = 'true';
    expect(getHostingConfig().mysql.enabled).toBe(true);
    process.env.HOSTING_MYSQL_ENABLED = 'false';
    expect(getHostingConfig().mysql.enabled).toBe(false);
  });
});
