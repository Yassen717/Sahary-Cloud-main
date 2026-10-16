export interface HostingConfig {
  baseDomain: string;
  wwwBase: string;
  trashDir: string;
  allowUnpaidAccounts: boolean;
  jobsEnabled: boolean;
  retentionDays: number;
  suspendedRetentionDays: number;
  pastDueGraceDays: number;
  nginx: {
    enabled: boolean;
    sitesAvailable: string;
    sitesEnabled: string;
    stagingDir: string;
    logDir: string;
  };
  mysql: {
    enabled: boolean;
    adminUrl: string;
    publicHost: string;
    publicPort: number;
    userHost: string;
  };
  ftp: {
    driver: 'none' | 'pureftpd';
    publicHost: string;
    port: number;
    systemUser: string;
    systemGroup: string;
    purePwBin: string;
    passwdFile: string;
    pdbFile: string;
  };
  ssl: {
    enabled: boolean;
    certbotBin: string;
    acmeWebroot: string;
    email: string;
    staging: boolean;
    liveDir: string;
    wildcardCertPath: string;
    wildcardKeyPath: string;
  };
  files: {
    uploadMaxMB: number;
    textEditMaxKB: number;
  };
  cron: {
    meter: string;
    ssl: string;
    reconcile: string;
    retention: string;
  };
}

const bool = (value: string | undefined, fallback: boolean): boolean =>
  (value === undefined || value === '') ? fallback : value === 'true';

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

// Re-reads env on every call so tests can set/unset variables per case.
export function getHostingConfig(env: NodeJS.ProcessEnv = process.env): HostingConfig {
  const baseDomain = env.HOSTING_BASE_DOMAIN || 'sahary.cloud';
  const wwwBase = env.HOSTING_WWW_BASE || '/var/www';

  return {
    baseDomain,
    wwwBase,
    trashDir: env.HOSTING_TRASH_DIR || `${wwwBase}/.trash`,
    allowUnpaidAccounts: bool(env.HOSTING_ALLOW_UNPAID_ACCOUNTS, false),
    jobsEnabled: bool(env.HOSTING_JOBS_ENABLED, true),
    retentionDays: int(env.HOSTING_RETENTION_DAYS, 7),
    suspendedRetentionDays: int(env.HOSTING_SUSPENDED_RETENTION_DAYS, 30),
    pastDueGraceDays: int(env.HOSTING_PAST_DUE_GRACE_DAYS, 7),
    nginx: {
      enabled: bool(env.HOSTING_NGINX_ENABLED, false),
      sitesAvailable: env.HOSTING_NGINX_SITES_AVAILABLE || '/etc/nginx/sites-available',
      sitesEnabled: env.HOSTING_NGINX_SITES_ENABLED || '/etc/nginx/sites-enabled',
      stagingDir: env.HOSTING_NGINX_STAGING_DIR || '/etc/nginx/sites-staging',
      logDir: env.HOSTING_NGINX_LOG_DIR || '/var/log/nginx/sahary',
    },
    mysql: {
      enabled: bool(env.HOSTING_MYSQL_ENABLED, false),
      adminUrl: env.HOSTING_MYSQL_ADMIN_URL || '',
      publicHost: env.HOSTING_MYSQL_PUBLIC_HOST || 'localhost',
      publicPort: int(env.HOSTING_MYSQL_PUBLIC_PORT, 3306),
      userHost: env.HOSTING_MYSQL_USER_HOST || '%',
    },
    ftp: {
      driver: env.HOSTING_FTP_DRIVER === 'pureftpd' ? 'pureftpd' : 'none',
      publicHost: env.HOSTING_FTP_PUBLIC_HOST || `ftp.${baseDomain}`,
      port: int(env.HOSTING_FTP_PORT, 21),
      systemUser: env.HOSTING_FTP_SYSTEM_USER || 'ftpuser',
      systemGroup: env.HOSTING_FTP_SYSTEM_GROUP || 'ftpgroup',
      purePwBin: env.HOSTING_FTP_PUREPW_BIN || 'pure-pw',
      passwdFile: env.HOSTING_FTP_PASSWD_FILE || '/etc/pure-ftpd/pureftpd.passwd',
      pdbFile: env.HOSTING_FTP_PDB_FILE || '/etc/pure-ftpd/pureftpd.pdb',
    },
    ssl: {
      enabled: bool(env.HOSTING_SSL_ENABLED, false),
      certbotBin: env.HOSTING_CERTBOT_BIN || 'certbot',
      acmeWebroot: env.HOSTING_ACME_WEBROOT || '/var/www/_acme',
      email: env.HOSTING_LETSENCRYPT_EMAIL || '',
      staging: bool(env.HOSTING_LETSENCRYPT_STAGING, false),
      liveDir: env.HOSTING_LETSENCRYPT_LIVE_DIR || '/etc/letsencrypt/live',
      wildcardCertPath: env.HOSTING_WILDCARD_CERT_PATH || '',
      wildcardKeyPath: env.HOSTING_WILDCARD_KEY_PATH || '',
    },
    files: {
      uploadMaxMB: int(env.HOSTING_UPLOAD_MAX_MB, 50),
      textEditMaxKB: int(env.HOSTING_TEXT_EDIT_MAX_KB, 1024),
    },
    cron: {
      meter: env.HOSTING_METER_CRON || '0 * * * *',
      ssl: env.HOSTING_SSL_CRON || '*/10 * * * *',
      reconcile: env.HOSTING_RECONCILE_CRON || '15 */6 * * *',
      retention: env.HOSTING_RETENTION_CRON || '30 3 * * *',
    },
  };
}

export default { getHostingConfig };
