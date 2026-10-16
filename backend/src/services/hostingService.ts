import crypto from 'crypto';
import { promises as dns } from 'dns';
import type { HostingAccount, HostingPlan } from '@prisma/client';
import { prisma } from '../config/database';
import { getHostingConfig } from '../config/hosting';
import { httpError } from '../utils/httpError';
import logger from '../utils/logger';
import type { HostingAccountDTO, HostingDomainDTO, HostingPlanDTO } from '../types/hosting';
import { toAccountDTO, toDomainDTO, toPlanDTO } from './hostingDto';
import * as sslService from './sslService';

// Legacy @ts-nocheck CJS module (owned by WP05) — require() + typed surface.
const VhostService = require('./vhostService') as {
  syncAccountVhost(input: {
    primaryDomain: string;
    customDomains: string[];
    documentRoot: string;
  }): Promise<unknown>;
  removeAccountVhost(primaryDomain: string): Promise<unknown>;
};

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

// First labels under the base domain reserved for the platform itself.
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'mail', 'app', 'admin', 'status', 'ns', 'ftp', 'cpanel']);

export type HostingAccountWithPlan = HostingAccount & { plan: HostingPlan };

/**
 * Derive a safe FTP username from a domain string.
 * POSIX user names: lowercase, alphanumeric + underscore, max 32 chars.
 */
export function ftpUsernameFromDomain(domain: string): string {
  return domain
    .replace(/\./g, '_')
    .replace(/[^a-z0-9_]/gi, '')
    .toLowerCase()
    .slice(0, 32);
}

/**
 * Derive the platform-subdomain prefix from a user's email address.
 */
export function subdomainPrefixFromEmail(email: string): string {
  return email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 32) || 'user';
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/**
 * Return all active hosting plans, ordered cheapest first.
 */
export async function getPlans(): Promise<HostingPlanDTO[]> {
  const plans = await prisma.hostingPlan.findMany({
    where: { isActive: true },
    orderBy: { monthlyPrice: 'asc' },
  });
  return plans.map(toPlanDTO);
}

// ---------------------------------------------------------------------------
// Account read
// ---------------------------------------------------------------------------

/**
 * Fetch the current user's hosting account as a DTO.
 * Any non-TERMINATED status is returned.
 */
export async function getAccountByUser(userId: string): Promise<HostingAccountDTO> {
  const account = await prisma.hostingAccount.findFirst({
    where: { userId, status: { not: 'TERMINATED' } },
    include: { plan: true, domains: true },
  });
  if (!account) {
    throw httpError(404, 'No hosting account found');
  }
  return toAccountDTO(account);
}

// ---------------------------------------------------------------------------
// Custom domain management
// ---------------------------------------------------------------------------

/**
 * List all custom domains attached to the user's account.
 */
export async function getDomains(userId: string): Promise<HostingDomainDTO[]> {
  const account = await _requireActiveAccount(userId);
  const domains = await prisma.hostingDomain.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: 'asc' },
  });
  return domains.map(toDomainDTO);
}

/**
 * Add a custom domain to the user's account.
 * Returns the domain DTO including the DNS TXT verification record.
 */
export async function addDomain(userId: string, domain: string): Promise<HostingDomainDTO> {
  const account = await _requireActiveAccount(userId);

  const normalized = String(domain).toLowerCase().trim();
  _assertClaimableDomain(normalized);

  const verifyToken = crypto.randomBytes(24).toString('hex');

  // Limit check, cross-table uniqueness check and insert run atomically to
  // avoid TOCTOU races (concurrent adds or an account-creation claim).
  const created = await prisma.$transaction(async (tx) => {
    const currentCount = await tx.hostingDomain.count({
      where: { accountId: account.id },
    });
    if (currentCount >= account.plan.maxDomains) {
      throw httpError(409, `Domain limit reached for your plan (max ${account.plan.maxDomains})`);
    }

    const [accountHit, domainHit] = await Promise.all([
      tx.hostingAccount.findUnique({ where: { domain: normalized } }),
      tx.hostingDomain.findUnique({ where: { domain: normalized } }),
    ]);
    if (accountHit || domainHit) {
      throw httpError(409, 'Domain is already registered on this platform');
    }

    return tx.hostingDomain.create({
      data: {
        domain: normalized,
        verifyToken,
        accountId: account.id,
      },
    });
  });

  try {
    const customDomains = await _getCustomDomains(account.id);
    await VhostService.syncAccountVhost({
      primaryDomain: account.domain,
      customDomains,
      documentRoot: account.documentRoot ?? '',
    });
  } catch (error) {
    await prisma.hostingDomain.delete({ where: { id: created.id } });
    throw error;
  }

  return toDomainDTO(created);
}

/**
 * Remove a custom domain from the user's account.
 */
export async function removeDomain(userId: string, domainId: string): Promise<{ removed: true }> {
  const account = await _requireActiveAccount(userId);

  const record = await prisma.hostingDomain.findUnique({ where: { id: domainId } });
  if (!record) {
    throw httpError(404, 'Domain not found');
  }
  if (record.accountId !== account.id) {
    throw httpError(403, 'Forbidden');
  }

  await prisma.hostingDomain.delete({ where: { id: domainId } });

  try {
    const customDomains = await _getCustomDomains(account.id);
    await VhostService.syncAccountVhost({
      primaryDomain: account.domain,
      customDomains,
      documentRoot: account.documentRoot ?? '',
    });
  } catch (error) {
    await prisma.hostingDomain.create({
      data: {
        id: record.id,
        domain: record.domain,
        isVerified: record.isVerified,
        verifyToken: record.verifyToken,
        sslEnabled: record.sslEnabled,
        sslIssuedAt: record.sslIssuedAt,
        sslExpiresAt: record.sslExpiresAt,
        sslStatus: record.sslStatus,
        sslLastError: record.sslLastError,
        sslLastAttemptAt: record.sslLastAttemptAt,
        accountId: record.accountId,
        createdAt: record.createdAt,
      },
    });
    throw error;
  }

  // Domain is fully detached — drop any issued certificate (best-effort).
  try {
    await sslService.deleteCertificate(record.domain);
  } catch (error) {
    logger.warn('Certificate cleanup after domain removal failed', {
      domain: record.domain,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return { removed: true };
}

/**
 * Verify domain ownership by checking for the DNS TXT record.
 * The user must have added `sahary-verify=<verifyToken>` as a TXT record.
 */
export async function verifyDomain(userId: string, domainId: string): Promise<HostingDomainDTO> {
  const account = await _requireActiveAccount(userId);

  const record = await prisma.hostingDomain.findUnique({ where: { id: domainId } });
  if (!record) throw httpError(404, 'Domain not found');
  if (record.accountId !== account.id) throw httpError(403, 'Forbidden');
  if (record.isVerified) return toDomainDTO(record); // already verified

  let txtRecords: string[][];
  try {
    txtRecords = await dns.resolveTxt(record.domain);
  } catch {
    throw httpError(400, 'DNS lookup failed — make sure the TXT record has propagated');
  }

  const flat = txtRecords.flat();
  const expected = `sahary-verify=${record.verifyToken}`;
  if (!flat.includes(expected)) {
    throw httpError(400, 'TXT record not found — add the verification record and try again');
  }

  const updated = await prisma.hostingDomain.update({
    where: { id: domainId },
    data: { isVerified: true },
  });

  // Only emit the domain into server_name after verification — and revert
  // the flag if the sync fails so it is never marked verified while absent.
  try {
    const customDomains = await _getCustomDomains(account.id);
    await VhostService.syncAccountVhost({
      primaryDomain: account.domain,
      customDomains,
      documentRoot: account.documentRoot ?? '',
    });
  } catch (error) {
    await prisma.hostingDomain.update({
      where: { id: domainId },
      data: { isVerified: false },
    });
    throw error;
  }

  return toDomainDTO(updated);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reject domains a tenant may never claim: the platform's own base domain,
 * any platform subdomain (including reserved labels), and malformed input.
 * External domains are additionally gated by DNS TXT verification.
 */
export function _assertClaimableDomain(domain: string): void {
  const { baseDomain } = getHostingConfig();
  const lower = String(domain || '').toLowerCase().trim();
  if (lower.length > 253 || !DOMAIN_REGEX.test(lower)) {
    throw httpError(400, 'Invalid domain format');
  }
  if (lower === baseDomain) {
    throw httpError(400, 'The platform base domain cannot be claimed');
  }
  if (lower.endsWith(`.${baseDomain}`)) {
    const firstLabel = lower.split('.')[0];
    if (RESERVED_SUBDOMAINS.has(firstLabel)) {
      throw httpError(400, `The '${firstLabel}.${baseDomain}' subdomain is reserved`);
    }
    throw httpError(400, 'Platform-managed domains cannot be claimed');
  }
}

/**
 * Cross-table uniqueness: a domain claimed as an account primary OR as a
 * custom domain on ANY account is unavailable — otherwise the same
 * server_name in two accounts allows an nginx first-match hijack.
 */
export async function _isDomainTaken(domain: string): Promise<boolean> {
  const [accountHit, domainHit] = await Promise.all([
    prisma.hostingAccount.findUnique({ where: { domain } }),
    prisma.hostingDomain.findUnique({ where: { domain } }),
  ]);
  return Boolean(accountHit || domainHit);
}

/**
 * Generate a unique `<prefix>.<baseDomain>` subdomain, appending a numeric
 * suffix if the base is already taken or reserved for the platform.
 */
export async function _uniqueSubdomain(prefix: string): Promise<string> {
  const { baseDomain } = getHostingConfig();
  let candidate = `${prefix}.${baseDomain}`;
  let i = 2;
  while (
    RESERVED_SUBDOMAINS.has(candidate.split('.')[0])
    || (await _isDomainTaken(candidate))
  ) {
    candidate = `${prefix}${i}.${baseDomain}`;
    i += 1;
  }
  return candidate;
}

export async function _requireActiveAccount(userId: string): Promise<HostingAccountWithPlan> {
  const account = await prisma.hostingAccount.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { plan: true },
  });
  if (!account) {
    throw httpError(404, 'No active hosting account found');
  }
  return account;
}

export async function _getCustomDomains(accountId: string): Promise<string[]> {
  const records = await prisma.hostingDomain.findMany({
    where: { accountId, isVerified: true },
    select: { domain: true },
  });
  return records.map((r) => r.domain);
}
