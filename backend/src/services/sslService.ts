import fs from 'fs/promises';
import { accessSync, constants as fsConstants, readFileSync } from 'fs';
import { execFile } from 'child_process';
import { X509Certificate } from 'crypto';
import type { HostingAccount, HostingDomain, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { getHostingConfig } from '../config/hosting';
import { httpError } from '../utils/httpError';
import logger from '../utils/logger';
import * as notificationService from './hostingNotificationService';
import type { SslStatus } from '../types/hosting';

const CERTBOT_TIMEOUT_MS = 120_000;
const CERTBOT_VERSION_TIMEOUT_MS = 15_000;
const WILDCARD_CACHE_MS = 5 * 60 * 1000;
const PENDING_STALE_MS = 15 * 60 * 1000;
const RETRY_BACKOFF_MS = 60 * 60 * 1000;
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000;
const EXPIRY_NOTICE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const ISSUE_BATCH_LIMIT = 10;
const PRIMARY_SYNC_LIMIT = 200;
const MAX_ERROR_LEN = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const isValidDomainName = (domain: unknown): domain is string =>
  typeof domain === 'string' && domain.length <= 253 && DOMAIN_REGEX.test(domain);

type ExecFailure = Error & { stdout?: string; stderr?: string; code?: number | string };

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const runCertbot = (
  args: string[],
  timeoutMs = CERTBOT_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    // Fixed argv only — execFile never goes through a shell, and the only
    // caller-controlled value (the domain) is regex-validated before use.
    execFile(getHostingConfig().ssl.certbotBin, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
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

// certbot output is verbose and embeds local paths and the ACME account email.
// Boil it down to one sanitized line for storage/display.
const summarizeCertbotError = (error: unknown): string => {
  const failure = error as ExecFailure;
  const text = [failure.stderr, failure.stdout, failure.message]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const interesting = lines.filter((line) => /error|fail|invalid|denied|unauthorized|limit|problem|expired/i.test(line));
  const picked = interesting[0] ?? lines[lines.length - 1] ?? 'certbot failed';
  const sanitized = picked
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\S*[\\/]\S*/g, '[path]')
    .replace(/[^\x20-\x7E]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (sanitized || 'Certificate operation failed').slice(0, MAX_ERROR_LEN);
};

const certPathsFor = (liveDir: string, domain: string): { fullchain: string; privkey: string } => {
  const base = liveDir.replace(/[\\/]+$/, '');
  return { fullchain: `${base}/${domain}/fullchain.pem`, privkey: `${base}/${domain}/privkey.pem` };
};

const readCertExpiry = async (fullchainPath: string): Promise<Date> => {
  const pem = await fs.readFile(fullchainPath);
  const cert = new X509Certificate(pem);
  const expiresAt = new Date(cert.validTo);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error('Could not parse certificate expiry');
  }
  return expiresAt;
};

const resyncAccountVhost = async (
  account: Pick<HostingAccount, 'domain' | 'documentRoot'>,
): Promise<void> => {
  if (!account.documentRoot) {
    logger.warn('Skipping vhost re-sync: account has no documentRoot', { domain: account.domain });
    return;
  }
  // Lazy require: vhostService calls getWildcardStatus() from this module.
  const vhost = require('./vhostService') as typeof import('./vhostService');
  await vhost.syncAccountVhost({
    primaryDomain: account.domain,
    documentRoot: account.documentRoot,
  });
};

/**
 * Custom-domain certificate issuance is considered configured only when the
 * feature flag is on AND an ACME account email exists (certbot registration
 * cannot run without it).
 */
export function isSslEnabled(): boolean {
  const { ssl } = getHostingConfig();
  return ssl.enabled && ssl.email.length > 0;
}

interface WildcardStatus {
  available: boolean;
  expiresAt: Date | null;
}

let wildcardCache: {
  certPath: string;
  keyPath: string;
  checkedAt: number;
  status: WildcardStatus;
} | null = null;

const evaluateWildcard = (certPath: string, keyPath: string): WildcardStatus => {
  if (!certPath || !keyPath) {
    return { available: false, expiresAt: null };
  }
  try {
    const cert = new X509Certificate(readFileSync(certPath));
    const expiresAt = new Date(cert.validTo);
    if (Number.isNaN(expiresAt.getTime())) {
      return { available: false, expiresAt: null };
    }
    // The key must be readable too — nginx -t fails otherwise.
    accessSync(keyPath, fsConstants.R_OK);
    return { available: expiresAt.getTime() > Date.now(), expiresAt };
  } catch {
    return { available: false, expiresAt: null };
  }
};

export function getWildcardStatus(): { available: boolean; expiresAt: Date | null } {
  const { ssl } = getHostingConfig();
  const now = Date.now();
  if (
    wildcardCache
    && wildcardCache.certPath === ssl.wildcardCertPath
    && wildcardCache.keyPath === ssl.wildcardKeyPath
    && now - wildcardCache.checkedAt < WILDCARD_CACHE_MS
  ) {
    return wildcardCache.status;
  }
  const status = evaluateWildcard(ssl.wildcardCertPath, ssl.wildcardKeyPath);
  wildcardCache = {
    certPath: ssl.wildcardCertPath,
    keyPath: ssl.wildcardKeyPath,
    checkedAt: now,
    status,
  };
  return status;
}

/** Test/maintenance hook: drop the cached wildcard evaluation. */
export function _resetWildcardCache(): void {
  wildcardCache = null;
}

const claimDomainForIssuance = async (
  domain: HostingDomain & { account: HostingAccount },
): Promise<'issued' | 'renew'> => {
  const now = new Date();
  const stalePendingBefore = new Date(now.getTime() - PENDING_STALE_MS);
  const expiringBefore = new Date(now.getTime() + RENEW_BEFORE_MS);

  // Atomic claim: flip to PENDING only from a state that may (re)issue —
  // NONE/FAILED always, PENDING only when a previous attempt went stale,
  // ACTIVE only when the cert is inside the renewal window (or its expiry was
  // never recorded). Concurrent claimants lose the updateMany race and get 0.
  const claim = await prisma.hostingDomain.updateMany({
    where: {
      id: domain.id,
      OR: [
        { sslStatus: { in: ['NONE', 'FAILED'] } },
        {
          sslStatus: 'PENDING',
          OR: [{ sslLastAttemptAt: null }, { sslLastAttemptAt: { lt: stalePendingBefore } }],
        },
        {
          sslStatus: 'ACTIVE',
          OR: [{ sslExpiresAt: null }, { sslExpiresAt: { lt: expiringBefore } }],
        },
      ],
    },
    data: { sslStatus: 'PENDING', sslLastAttemptAt: now },
  });

  if (claim.count === 0) {
    const inFlight = domain.sslStatus === 'PENDING';
    throw httpError(
      409,
      inFlight
        ? 'Certificate issuance is already in progress for this domain'
        : 'Domain already has an active certificate',
    );
  }

  return domain.sslStatus === 'ACTIVE' ? 'renew' : 'issued';
};

export async function issueCertificateForDomain(domainId: string): Promise<{ status: SslStatus }> {
  const { ssl } = getHostingConfig();
  if (!isSslEnabled()) {
    throw httpError(503, 'SSL is not enabled on this server');
  }

  const domain = await prisma.hostingDomain.findUnique({
    where: { id: domainId },
    include: { account: true },
  });
  if (!domain) {
    throw httpError(404, 'Domain not found');
  }
  if (!isValidDomainName(domain.domain)) {
    throw httpError(400, 'Domain name is invalid');
  }
  if (!domain.isVerified) {
    throw httpError(409, 'Verify the domain first');
  }
  if (domain.account.status !== 'ACTIVE') {
    throw httpError(409, 'Hosting account is not active');
  }

  const mode = await claimDomainForIssuance(domain);
  const attemptedAt = new Date();
  const paths = certPathsFor(ssl.liveDir, domain.domain);

  try {
    await fs.mkdir(ssl.acmeWebroot, { recursive: true });
    if (mode === 'renew') {
      // A cert already exists for this name — certonly would refuse the
      // duplicate; renew performs the in-window re-issuance instead.
      await runCertbot(['renew', '--cert-name', domain.domain, '--non-interactive']);
    } else {
      await runCertbot([
        'certonly', '--webroot', '-w', ssl.acmeWebroot,
        '-d', domain.domain, '--cert-name', domain.domain,
        '--non-interactive', '--agree-tos', '-m', ssl.email,
        ...(ssl.staging ? ['--staging'] : []),
      ]);
    }
    const expiresAt = await readCertExpiry(paths.fullchain);

    await prisma.hostingDomain.update({
      where: { id: domain.id },
      data: {
        sslStatus: 'ACTIVE',
        sslEnabled: true,
        sslIssuedAt: attemptedAt,
        sslExpiresAt: expiresAt,
        sslLastError: null,
        sslLastAttemptAt: attemptedAt,
        sslExpiryNoticeLevel: 0,
      },
    });
  } catch (error) {
    const message = summarizeCertbotError(error);
    const wasFailed = domain.sslStatus === 'FAILED';
    await prisma.hostingDomain.update({
      where: { id: domain.id },
      data: {
        sslStatus: 'FAILED',
        sslLastError: message,
        sslLastAttemptAt: new Date(),
      },
    });
    logger.error('Certificate issuance failed', { domain: domain.domain, message });
    // Notify only on the transition into FAILED — repeat failures stay quiet.
    if (!wasFailed) {
      await notificationService.notifySslFailed(domain.id, message);
    }
    return { status: 'FAILED' };
  }

  try {
    await resyncAccountVhost(domain.account);
  } catch (error) {
    logger.error('Vhost re-sync after certificate issuance failed', {
      domain: domain.domain,
      message: errorMessage(error),
    });
  }
  await notificationService.notifySslIssued(domain.id);
  return { status: 'ACTIVE' };
}

export async function issuePendingCertificates(): Promise<{ attempted: number; issued: number; failed: number }> {
  if (!isSslEnabled()) {
    return { attempted: 0, issued: 0, failed: 0 };
  }

  const now = Date.now();
  const stalePendingBefore = new Date(now - PENDING_STALE_MS);
  const retryBefore = new Date(now - RETRY_BACKOFF_MS);

  const candidates = await prisma.hostingDomain.findMany({
    where: {
      isVerified: true,
      account: { status: 'ACTIVE' },
      OR: [
        { sslStatus: 'NONE' },
        {
          sslStatus: 'PENDING',
          OR: [{ sslLastAttemptAt: null }, { sslLastAttemptAt: { lt: stalePendingBefore } }],
        },
        {
          sslStatus: 'FAILED',
          OR: [{ sslLastAttemptAt: null }, { sslLastAttemptAt: { lt: retryBefore } }],
        },
      ],
    },
    orderBy: { sslLastAttemptAt: 'asc' },
    take: ISSUE_BATCH_LIMIT,
  });

  let attempted = 0;
  let issued = 0;
  let failed = 0;
  for (const candidate of candidates) {
    attempted += 1;
    try {
      const { status } = await issueCertificateForDomain(candidate.id);
      if (status === 'ACTIVE') {
        issued += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
      logger.warn('Pending certificate issuance skipped', {
        domain: candidate.domain,
        message: errorMessage(error),
      });
    }
  }
  return { attempted, issued, failed };
}

export async function renewExpiringCertificates(): Promise<{ checked: number; renewed: number; failed: number }> {
  if (!isSslEnabled()) {
    return { checked: 0, renewed: 0, failed: 0 };
  }

  const { ssl } = getHostingConfig();
  const renewBefore = new Date(Date.now() + RENEW_BEFORE_MS);
  const domains = await prisma.hostingDomain.findMany({
    where: {
      sslStatus: 'ACTIVE',
      sslExpiresAt: { lte: renewBefore },
      account: { status: { in: ['ACTIVE', 'SUSPENDED'] } },
    },
    include: { account: true },
    orderBy: { sslExpiresAt: 'asc' },
  });

  let checked = 0;
  let renewed = 0;
  let failed = 0;
  for (const domain of domains) {
    checked += 1;
    const paths = certPathsFor(ssl.liveDir, domain.domain);
    const attemptedAt = new Date();
    try {
      await runCertbot(['renew', '--cert-name', domain.domain, '--non-interactive']);
      const expiresAt = await readCertExpiry(paths.fullchain);
      await prisma.hostingDomain.update({
        where: { id: domain.id },
        data: {
          sslIssuedAt: attemptedAt,
          sslExpiresAt: expiresAt,
          sslLastError: null,
          sslLastAttemptAt: attemptedAt,
          sslExpiryNoticeLevel: 0,
        },
      });
      try {
        await resyncAccountVhost(domain.account);
      } catch (error) {
        logger.error('Vhost re-sync after certificate renewal failed', {
          domain: domain.domain,
          message: errorMessage(error),
        });
      }
      renewed += 1;
    } catch (error) {
      failed += 1;
      const message = summarizeCertbotError(error);
      // The cert stays ACTIVE until it actually expires — only the last
      // error is recorded, plus one notice per severity level while the
      // renewal keeps failing.
      const daysLeft = domain.sslExpiresAt
        ? Math.max(0, Math.floor((domain.sslExpiresAt.getTime() - attemptedAt.getTime()) / DAY_MS))
        : 0;
      let noticeLevel = domain.sslExpiryNoticeLevel;
      for (const threshold of [7, 14]) {
        if (daysLeft <= threshold && (noticeLevel === 0 || noticeLevel > threshold)) {
          noticeLevel = threshold;
          await notificationService.notifySslExpiring(domain.id, daysLeft);
          break;
        }
      }
      await prisma.hostingDomain.update({
        where: { id: domain.id },
        data: {
          sslLastError: message,
          sslLastAttemptAt: attemptedAt,
          sslExpiryNoticeLevel: noticeLevel,
        },
      });
      logger.error('Certificate renewal failed', { domain: domain.domain, message, daysLeft });
    }
  }
  return { checked, renewed, failed };
}

export async function deleteCertificate(domain: string): Promise<void> {
  const { ssl } = getHostingConfig();
  if (ssl.enabled && isValidDomainName(domain)) {
    try {
      await runCertbot(['delete', '--cert-name', domain, '--non-interactive']);
    } catch (error) {
      logger.warn('certbot delete failed (continuing)', { domain, message: errorMessage(error) });
    }
  }

  try {
    await prisma.hostingDomain.updateMany({
      where: { domain },
      data: {
        sslStatus: 'NONE',
        sslEnabled: false,
        sslIssuedAt: null,
        sslExpiresAt: null,
        sslLastError: null,
        sslLastAttemptAt: null,
        sslExpiryNoticeLevel: 0,
      },
    });
  } catch (error) {
    logger.warn('Failed to clear domain SSL state after certificate delete', {
      domain,
      message: errorMessage(error),
    });
  }
}

export async function syncPrimarySslState(): Promise<{ updated: number }> {
  const wildcard = getWildcardStatus();
  const targetEnabled = wildcard.available;
  const targetExpiresAt = wildcard.available ? wildcard.expiresAt : null;

  const expiryMismatch: Prisma.HostingAccountWhereInput = targetExpiresAt === null
    ? { sslExpiresAt: { not: null } }
    : { OR: [{ sslExpiresAt: null }, { sslExpiresAt: { not: targetExpiresAt } }] };

  const stale = await prisma.hostingAccount.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ sslEnabled: !targetEnabled }, expiryMismatch],
    },
    select: { id: true, domain: true, documentRoot: true },
    take: PRIMARY_SYNC_LIMIT,
  });

  if (stale.length === 0) {
    return { updated: 0 };
  }

  await prisma.hostingAccount.updateMany({
    where: { id: { in: stale.map((account) => account.id) } },
    data: { sslEnabled: targetEnabled, sslExpiresAt: targetExpiresAt },
  });

  for (const account of stale) {
    try {
      await resyncAccountVhost(account);
    } catch (error) {
      logger.error('Vhost re-sync after primary SSL state change failed', {
        domain: account.domain,
        message: errorMessage(error),
      });
    }
  }

  return { updated: stale.length };
}

export async function healthCheck(): Promise<{ ok: boolean; message?: string }> {
  const { ssl } = getHostingConfig();
  if (!ssl.enabled) {
    return { ok: true, message: 'disabled' };
  }
  if (!ssl.email) {
    return { ok: false, message: 'HOSTING_LETSENCRYPT_EMAIL is not configured' };
  }
  try {
    await runCertbot(['--version'], CERTBOT_VERSION_TIMEOUT_MS);
  } catch (error) {
    return { ok: false, message: `certbot is not available: ${errorMessage(error)}` };
  }
  if (ssl.wildcardCertPath) {
    const wildcard = evaluateWildcard(ssl.wildcardCertPath, ssl.wildcardKeyPath);
    if (!wildcard.available || !wildcard.expiresAt) {
      return { ok: false, message: 'wildcard certificate is missing, unreadable or expired' };
    }
    if (wildcard.expiresAt.getTime() - Date.now() < EXPIRY_NOTICE_WINDOW_MS) {
      return { ok: false, message: 'wildcard certificate expires within 14 days' };
    }
  }
  return { ok: true };
}
