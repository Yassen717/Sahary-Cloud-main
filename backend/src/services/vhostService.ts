import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import type { HostingAccount, HostingDomain } from '@prisma/client';
import { prisma } from '../config/database';
import { getHostingConfig } from '../config/hosting';
import type { HostingConfig } from '../config/hosting';
import { httpError } from '../utils/httpError';
import logger from '../utils/logger';

const EXEC_TIMEOUT_MS = 10_000;

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const ACCOUNT_ID_REGEX = /^[a-z0-9]+$/;
// These characters are nginx config syntax (separators, block braces, comments,
// variables) or token delimiters — never allow them inside an emitted path.
const UNSAFE_PATH_CHARS = /[\s"'`;{}$#|]/;
const WINDOWS_ABS_REGEX = /^[A-Za-z]:[\\/]/;
const ERRNO_ENOENT = 'ENOENT';

const NGINX_BIN = 'nginx';
const NGINX_TEST_ARGS = ['-t'];
const NGINX_RELOAD_ARGS = ['-s', 'reload'];

const SUSPENDED_PAGE_BASENAME = 'suspended.html';

// Bilingual (EN + AR) maintenance page served for suspended accounts. Simple
// markup with inline CSS only — no external assets so it always loads.
const SUSPENDED_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Account suspended</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center}
.card{max-width:36rem;margin:1rem;padding:2rem;background:#1e293b;border-radius:.75rem;box-shadow:0 10px 30px rgba(0,0,0,.35)}
h1{margin:0 0 .75rem;font-size:1.5rem}
p{margin:.25rem 0;line-height:1.7}
hr{border:0;border-top:1px solid #334155;margin:1.5rem 0}
.ar{direction:rtl}
</style>
</head>
<body>
<div class="card">
<section lang="en">
<h1>Account suspended</h1>
<p>This hosting account has been suspended. If you are the site owner, please sign in to your dashboard or contact support for details.</p>
</section>
<hr>
<section lang="ar" dir="rtl" class="ar">
<h1>تم تعليق الحساب</h1>
<p>تم تعليق حساب الاستضافة هذا. إذا كنت مالك الموقع، يرجى تسجيل الدخول إلى لوحة التحكم الخاصة بك أو التواصل مع الدعم لمزيد من التفاصيل.</p>
</section>
</div>
</body>
</html>
`;

type ExecFailure = Error & { stdout?: string; stderr?: string; code?: number | string };

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const errnoCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException | undefined)?.code;

const runExecFile = (bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    // Fixed argv only — never a shell, never user-controlled strings.
    execFile(bin, args, { timeout: EXEC_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) {
        const failure = error as ExecFailure;
        failure.stdout = String(stdout ?? '');
        failure.stderr = String(stderr ?? '');
        reject(failure);
        return;
      }
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });

export const isValidDomainName = (domain: unknown): domain is string =>
  typeof domain === 'string' && domain.length <= 253 && DOMAIN_REGEX.test(domain);

const normalizeDomain = (domain: unknown): string => String(domain ?? '').trim().toLowerCase();

const isAbsolutePath = (value: string): boolean =>
  value.startsWith('/') || WINDOWS_ABS_REGEX.test(value);

// Every string interpolated into the generated nginx config is validated here
// (domains separately by regex): absolute, and free of characters that nginx
// would parse as config syntax. Violations abort with a client-visible 400.
const assertConfigPath = (value: unknown, label: string): string => {
  const pathValue = String(value ?? '');
  if (!pathValue || !isAbsolutePath(pathValue)) {
    throw httpError(400, `Cannot build vhost config: ${label} must be an absolute path`);
  }
  if (UNSAFE_PATH_CHARS.test(pathValue)) {
    throw httpError(400, `Cannot build vhost config: ${label} contains unsafe characters`);
  }
  return pathValue;
};

// Posix-style join used for paths emitted into the nginx config (the vhost
// always targets a POSIX server layout).
const joinNginxPath = (...parts: string[]): string => {
  const [first, ...rest] = parts;
  return rest.reduce((acc, part) => `${acc.replace(/[\\/]+$/, '')}/${part.replace(/^[\\/]+/, '')}`, first);
};

const accountIdFromDocumentRoot = (documentRoot: string): string => {
  const trimmed = documentRoot.replace(/[\\/]+$/, '');
  const accountId = path.basename(path.dirname(trimmed));
  if (!ACCOUNT_ID_REGEX.test(accountId)) {
    throw httpError(400, 'Cannot sync vhost: cannot derive account id from documentRoot');
  }
  return accountId;
};

const getConfigFileName = (primaryDomain: string): string => `${primaryDomain}.conf`;

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

export interface VhostTlsMaterial {
  certificatePath: string;
  keyPath: string;
}

export interface VhostCustomDomain {
  domain: string;
  tls: VhostTlsMaterial | null;
}

export interface BuildVhostConfigInput {
  primaryDomain: string;
  documentRoot: string;
  accountId: string;
  suspended: boolean;
  acmeWebroot: string;
  logDir: string;
  suspendedPagePath: string;
  primaryTls: VhostTlsMaterial | null;
  customDomains: VhostCustomDomain[];
}

interface RenderBlockOptions {
  tls: VhostTlsMaterial | null;
  redirectOnly: boolean;
}

const renderServerBlock = (
  input: BuildVhostConfigInput,
  serverName: string,
  opts: RenderBlockOptions,
): string => {
  const lines: string[] = ['server {'];
  if (opts.tls) {
    lines.push('    listen 443 ssl;', '    listen [::]:443 ssl;');
  } else {
    lines.push('    listen 80;', '    listen [::]:80;');
  }
  lines.push(`    server_name ${serverName};`, '');
  lines.push(`    access_log ${joinNginxPath(input.logDir, `${input.accountId}.access.log`)} sahary_bytes;`, '');
  if (opts.tls) {
    lines.push(`    ssl_certificate ${opts.tls.certificatePath};`, `    ssl_certificate_key ${opts.tls.keyPath};`, '    ssl_protocols TLSv1.2 TLSv1.3;', '');
  }
  lines.push(`    root ${input.documentRoot};`, '    index index.html index.htm;', '');
  lines.push(
    '    location ^~ /.well-known/acme-challenge/ {',
    `        root ${input.acmeWebroot};`,
    '    }',
    '',
  );
  if (opts.redirectOnly) {
    lines.push('    location / {', '        return 301 https://$host$request_uri;', '    }', '');
  } else if (input.suspended) {
    lines.push('    location / {', '        return 503;', '    }', '');
    lines.push('    error_page 503 /__suspended.html;', '');
    lines.push('    location = /__suspended.html {', '        internal;', `        alias ${input.suspendedPagePath};`, '    }', '');
  } else {
    lines.push('    location / {', '        try_files $uri $uri/ =404;', '    }', '');
  }
  lines.push('    location ~ /\\.(?!well-known) {', '        deny all;', '    }', '');
  lines.push(
    '    add_header X-Content-Type-Options nosniff;',
    '    add_header X-Frame-Options SAMEORIGIN;',
    '    add_header Referrer-Policy same-origin;',
  );
  if (opts.tls) {
    lines.push('    add_header Strict-Transport-Security "max-age=31536000" always;');
  }
  lines.push('}');
  return lines.join('\n');
};

/**
 * Pure renderer for a hosting account's nginx config. Every interpolated value
 * is validated — anything unsafe aborts with httpError(400) rather than
 * emitting a config nginx (or worse, an injection) would misinterpret.
 *
 * Per domain:
 *  - no usable TLS -> one :80 block serving the site (+ ACME challenge dir)
 *  - usable TLS -> :80 block that 301s to https (ACME still served) + :443 ssl
 *    block with TLSv1.2/1.3 and HSTS
 *  - account suspended -> every block answers 503 with the suspended page
 *    (the ACME location keeps working so renewals are not blocked)
 */
export function buildVhostConfig(input: BuildVhostConfigInput): string {
  const primaryDomain = normalizeDomain(input.primaryDomain);
  if (!isValidDomainName(primaryDomain)) {
    throw httpError(400, 'Cannot build vhost config: invalid primary domain');
  }
  const documentRoot = assertConfigPath(input.documentRoot, 'documentRoot');
  const logDir = assertConfigPath(input.logDir, 'logDir');
  const acmeWebroot = assertConfigPath(input.acmeWebroot, 'acmeWebroot');
  if (!ACCOUNT_ID_REGEX.test(input.accountId)) {
    throw httpError(400, 'Cannot build vhost config: invalid account id');
  }
  const suspendedPagePath = input.suspended
    ? assertConfigPath(input.suspendedPagePath, 'suspendedPagePath')
    : input.suspendedPagePath;

  const normalized: BuildVhostConfigInput = {
    ...input,
    primaryDomain,
    documentRoot,
    logDir,
    acmeWebroot,
    suspendedPagePath,
  };

  const checkedTls = (tls: VhostTlsMaterial | null): VhostTlsMaterial | null => {
    if (!tls) return null;
    return {
      certificatePath: assertConfigPath(tls.certificatePath, 'certificatePath'),
      keyPath: assertConfigPath(tls.keyPath, 'keyPath'),
    };
  };

  const customDomains: VhostCustomDomain[] = [];
  const seen = new Set<string>([primaryDomain]);
  for (const entry of input.customDomains ?? []) {
    const domain = normalizeDomain(entry?.domain);
    if (!isValidDomainName(domain)) {
      throw httpError(400, `Cannot build vhost config: invalid custom domain '${domain}'`);
    }
    if (seen.has(domain)) continue;
    seen.add(domain);
    customDomains.push({ domain, tls: checkedTls(entry.tls) });
  }
  customDomains.sort((a, b) => a.domain.localeCompare(b.domain));

  const blocks: string[] = [];
  const emitDomain = (serverName: string, tls: VhostTlsMaterial | null): void => {
    const checked = checkedTls(tls);
    if (checked && !normalized.suspended) {
      blocks.push(renderServerBlock(normalized, serverName, { tls: null, redirectOnly: true }));
    } else {
      blocks.push(renderServerBlock(normalized, serverName, { tls: null, redirectOnly: false }));
    }
    if (checked) {
      blocks.push(renderServerBlock(normalized, serverName, { tls: checked, redirectOnly: false }));
    }
  };

  emitDomain(primaryDomain, checkedTls(input.primaryTls));
  for (const entry of customDomains) {
    emitDomain(entry.domain, entry.tls);
  }

  return `${blocks.join('\n\n')}\n`;
}

const ensureEnabledEntry = async (targetPath: string, linkPath: string): Promise<void> => {
  try {
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink()) {
      const current = await fs.readlink(linkPath);
      if (current === targetPath) {
        return;
      }
    } else if (stat.isFile()) {
      // Copy fallback from a previous run on a host without symlink rights.
      const [existing, desired] = await Promise.all([
        fs.readFile(linkPath, 'utf8'),
        fs.readFile(targetPath, 'utf8'),
      ]);
      if (existing === desired) {
        return;
      }
    }
    // Remove whatever occupies the link path — stale symlink, regular file,
    // or anything else — before creating the new entry.
    await fs.unlink(linkPath);
  } catch (error) {
    if (errnoCode(error) !== ERRNO_ENOENT) {
      throw error;
    }
  }

  try {
    await fs.symlink(targetPath, linkPath, 'file');
  } catch (error) {
    const code = errnoCode(error);
    if (code === 'EPERM' || code === 'ENOSYS' || code === 'ENOTSUP') {
      // Windows hosts without the symlink privilege get an identical copy —
      // nginx treats a sites-enabled file and a symlink to it the same.
      logger.debug('Symlink creation not permitted; enabling vhost via file copy', { linkPath });
      await fs.copyFile(targetPath, linkPath);
      return;
    }
    throw error;
  }
};

const ensureSuspendedPage = async (pagePath: string): Promise<void> => {
  if (await pathExists(pagePath)) {
    return;
  }
  await fs.mkdir(path.dirname(pagePath), { recursive: true });
  await fs.writeFile(pagePath, SUSPENDED_PAGE_HTML, { encoding: 'utf8', mode: 0o644 });
};

type AccountWithDomains = HostingAccount & { domains: HostingDomain[] };

interface ResolveBuildInputArgs {
  config: HostingConfig;
  primaryDomain: string;
  customDomains: string[];
  documentRoot: string;
  accountId: string;
  account: AccountWithDomains | null;
}

const resolveBuildInput = async (args: ResolveBuildInputArgs): Promise<BuildVhostConfigInput> => {
  const { config, primaryDomain, customDomains, documentRoot, accountId, account } = args;
  const suspended = account?.status === 'SUSPENDED';
  const suspendedPagePath = joinNginxPath(config.wwwBase, '_system', SUSPENDED_PAGE_BASENAME);

  let primaryTls: VhostTlsMaterial | null = null;
  const domainEntries: VhostCustomDomain[] = [];

  if (account) {
    // Lazy require on purpose: sslService imports this module to re-sync
    // vhosts after issuance — loading eagerly would create a require cycle.
    const { getWildcardStatus } = require('./sslService') as typeof import('./sslService');
    const wildcard = getWildcardStatus();
    if (wildcard.available && config.ssl.wildcardCertPath && config.ssl.wildcardKeyPath) {
      primaryTls = {
        certificatePath: config.ssl.wildcardCertPath,
        keyPath: config.ssl.wildcardKeyPath,
      };
    }

    for (const record of account.domains) {
      if (!record.isVerified) continue;
      const domain = normalizeDomain(record.domain);
      if (!isValidDomainName(domain)) {
        logger.warn('Skipping invalid stored custom domain during vhost sync', {
          primaryDomain,
          domainId: record.id,
        });
        continue;
      }
      const certificatePath = joinNginxPath(config.ssl.liveDir, domain, 'fullchain.pem');
      const keyPath = joinNginxPath(config.ssl.liveDir, domain, 'privkey.pem');
      const usable = record.sslStatus === 'ACTIVE'
        && await pathExists(certificatePath)
        && await pathExists(keyPath);
      domainEntries.push({ domain, tls: usable ? { certificatePath, keyPath } : null });
    }
  } else {
    for (const raw of customDomains) {
      const domain = normalizeDomain(raw);
      if (!isValidDomainName(domain)) {
        logger.warn('Skipping invalid custom domain during vhost sync', { primaryDomain });
        continue;
      }
      domainEntries.push({ domain, tls: null });
    }
  }

  if (suspended) {
    try {
      await ensureSuspendedPage(suspendedPagePath);
    } catch (error) {
      logger.warn('Failed to provision suspended page', {
        suspendedPagePath,
        message: errorMessage(error),
      });
    }
  }

  return {
    primaryDomain,
    documentRoot,
    accountId,
    suspended,
    acmeWebroot: config.ssl.acmeWebroot,
    logDir: config.nginx.logDir,
    suspendedPagePath,
    primaryTls,
    customDomains: domainEntries,
  };
};

export interface SyncAccountVhostInput {
  primaryDomain: string;
  customDomains?: string[];
  documentRoot: string;
}

export type SyncAccountVhostResult =
  | { skipped: true }
  | { skipped: false; domains: string[]; configPath: string; symlinkPath: string };

export type RemoveAccountVhostResult =
  | { skipped: true }
  | { skipped: false; configPath: string; symlinkPath: string };

export async function syncAccountVhost({
  primaryDomain,
  customDomains = [],
  documentRoot,
}: SyncAccountVhostInput): Promise<SyncAccountVhostResult> {
  const config = getHostingConfig();
  if (!config.nginx.enabled) {
    logger.info('Vhost sync skipped: HOSTING_NGINX_ENABLED=false', { primaryDomain });
    return { skipped: true };
  }

  const primary = normalizeDomain(primaryDomain);
  if (!isValidDomainName(primary)) {
    throw httpError(400, 'Cannot sync vhost: invalid primary domain');
  }
  const root = assertConfigPath(documentRoot, 'documentRoot');
  const accountId = accountIdFromDocumentRoot(root);

  assertConfigPath(config.nginx.sitesAvailable, 'sitesAvailable');
  assertConfigPath(config.nginx.sitesEnabled, 'sitesEnabled');
  if (config.nginx.stagingDir) {
    assertConfigPath(config.nginx.stagingDir, 'stagingDir');
  }

  const account = await prisma.hostingAccount.findUnique({
    where: { domain: primary },
    include: { domains: true },
  });

  const buildInput = await resolveBuildInput({
    config,
    primaryDomain: primary,
    customDomains,
    documentRoot: root,
    accountId,
    account,
  });
  const configBody = buildVhostConfig(buildInput);
  const emittedDomains = [primary, ...buildInput.customDomains.map((entry) => entry.domain)];

  const confName = getConfigFileName(primary);
  const availablePath = path.join(config.nginx.sitesAvailable, confName);
  const enabledPath = path.join(config.nginx.sitesEnabled, confName);

  await fs.mkdir(config.nginx.sitesAvailable, { recursive: true });
  await fs.mkdir(config.nginx.sitesEnabled, { recursive: true });

  // Preserve the previous state so a failed sync can roll back to the last
  // known-good config instead of leaving a broken vhost enabled.
  let previousConfig: string | null = null;
  try {
    previousConfig = await fs.readFile(availablePath, 'utf8');
  } catch (error) {
    if (errnoCode(error) !== ERRNO_ENOENT) throw error;
  }
  let hadEnabled = false;
  try {
    await fs.lstat(enabledPath);
    hadEnabled = true;
  } catch (error) {
    if (errnoCode(error) !== ERRNO_ENOENT) throw error;
  }

  let stagingPath: string | null = null;
  try {
    // Write the candidate config WITHOUT enabling it yet.
    await fs.writeFile(availablePath, configBody, { encoding: 'utf8', mode: 0o644 });

    if (config.nginx.stagingDir) {
      // The staging dir is included by nginx.conf, so `nginx -t` parses the
      // candidate before it is enabled.
      await fs.mkdir(config.nginx.stagingDir, { recursive: true });
      stagingPath = path.join(config.nginx.stagingDir, confName);
      await fs.writeFile(stagingPath, configBody, { encoding: 'utf8', mode: 0o644 });
      await testConfig();
      await fs.unlink(stagingPath);
      stagingPath = null;
    }

    // Enable only after validation, then test + reload. When stagingDir is
    // unset this is also the first real parse of the candidate — a failure
    // triggers the rollback below, so a broken config never stays enabled.
    await ensureEnabledEntry(availablePath, enabledPath);
    await testAndReload();
  } catch (error) {
    // Roll back: drop the staging copy, disable the vhost and restore or
    // remove the config file.
    if (stagingPath) {
      try {
        await fs.unlink(stagingPath);
      } catch (stagingError) {
        logger.warn('Failed to remove staged vhost during rollback', {
          stagingPath,
          message: errorMessage(stagingError),
        });
      }
    }
    try {
      await fs.unlink(enabledPath);
    } catch (unlinkError) {
      if (errnoCode(unlinkError) !== ERRNO_ENOENT) {
        logger.error('Failed to disable broken vhost during rollback', {
          enabledPath,
          message: errorMessage(unlinkError),
        });
      }
    }
    try {
      if (previousConfig === null) {
        try {
          await fs.unlink(availablePath);
        } catch (unlinkError) {
          if (errnoCode(unlinkError) !== ERRNO_ENOENT) throw unlinkError;
        }
      } else {
        await fs.writeFile(availablePath, previousConfig, { encoding: 'utf8', mode: 0o644 });
        if (hadEnabled) {
          await ensureEnabledEntry(availablePath, enabledPath);
        }
      }
    } catch (restoreError) {
      logger.error('Failed to restore previous vhost config during rollback', {
        availablePath,
        message: errorMessage(restoreError),
      });
    }
    // Re-verify/reload so nginx returns to the last known-good state.
    try {
      await testAndReload();
    } catch (verifyError) {
      logger.error('Nginx still unhealthy after vhost rollback', {
        primaryDomain: primary,
        message: errorMessage(verifyError),
      });
    }
    logger.error('Vhost sync failed, rolled back', {
      primaryDomain: primary,
      availablePath,
      enabledPath,
      message: errorMessage(error),
    });
    throw error;
  }

  logger.info('Vhost synced', {
    primaryDomain: primary,
    domains: emittedDomains,
    availablePath,
    enabledPath,
  });

  return {
    skipped: false,
    domains: emittedDomains,
    configPath: availablePath,
    symlinkPath: enabledPath,
  };
}

export async function removeAccountVhost(primaryDomain: string): Promise<RemoveAccountVhostResult> {
  const config = getHostingConfig();
  if (!config.nginx.enabled) {
    logger.info('Vhost removal skipped: HOSTING_NGINX_ENABLED=false', { primaryDomain });
    return { skipped: true };
  }

  const primary = normalizeDomain(primaryDomain);
  if (!isValidDomainName(primary)) {
    throw httpError(400, 'Cannot remove vhost: invalid primary domain');
  }

  const confName = getConfigFileName(primary);
  const availablePath = path.join(config.nginx.sitesAvailable, confName);
  const enabledPath = path.join(config.nginx.sitesEnabled, confName);

  try {
    await fs.unlink(enabledPath);
  } catch (error) {
    if (errnoCode(error) !== ERRNO_ENOENT) throw error;
  }

  try {
    await fs.unlink(availablePath);
  } catch (error) {
    if (errnoCode(error) !== ERRNO_ENOENT) throw error;
  }

  await testAndReload();

  logger.info('Vhost removed', { primaryDomain: primary, availablePath, enabledPath });

  return {
    skipped: false,
    configPath: availablePath,
    symlinkPath: enabledPath,
  };
}

export async function testConfig(): Promise<void> {
  try {
    await runExecFile(NGINX_BIN, NGINX_TEST_ARGS);
  } catch (error) {
    const failure = error as ExecFailure;
    logger.error('Nginx config test failed', {
      message: failure.message,
      stderr: failure.stderr,
      stdout: failure.stdout,
    });
    throw httpError(502, 'Nginx configuration test failed');
  }
}

export async function testAndReload(): Promise<void> {
  await testConfig();
  try {
    await runExecFile(NGINX_BIN, NGINX_RELOAD_ARGS);
  } catch (error) {
    const failure = error as ExecFailure;
    logger.error('Nginx reload failed', {
      message: failure.message,
      stderr: failure.stderr,
      stdout: failure.stdout,
    });
    throw httpError(502, 'Nginx reload failed after vhost update');
  }
}

const VhostService = {
  syncAccountVhost,
  removeAccountVhost,
  testConfig,
  testAndReload,
  buildVhostConfig,
};

export default VhostService;
