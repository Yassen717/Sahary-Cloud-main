import { PrismaClient } from '@prisma/client';
import type { HostingAccount, HostingDomain, HostingPlan } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { promises as dns } from 'dns';
import path from 'path';
import VhostService from './vhostService';

const prisma = new PrismaClient();

// Base directory where all hosting document roots live.
// In production this is a real path on the server that Nginx serves.
const WWW_BASE = process.env.HOSTING_WWW_BASE || '/var/www';

// The platform's base domain for auto-assigned subdomains.
const BASE_DOMAIN = process.env.HOSTING_BASE_DOMAIN || 'sahary.cloud';

type HostingAccountWithRelations = HostingAccount & {
  plan: HostingPlan;
  domains: HostingDomain[];
};

type HostingAccountWithPlan = HostingAccount & {
  plan: HostingPlan;
};

type SanitizedAccount<T> = Omit<T, 'ftpPassword' | 'dbPassword'>;

type GeneratedCredential = {
  plain: string;
  hashed: string;
};

type CreateAccountResult = {
  account: SanitizedAccount<HostingAccountWithRelations>;
  credentials: {
    ftp: {
      host: string;
      user: string;
      password: string;
      port: number;
    };
    db: {
      name: string;
      user: string;
      password: string;
      host: string;
      port: number;
    };
  };
  documentRoot: string;
};

/**
 * Generate a cryptographically random password.
 * Returns { plain, hashed } — store only the hash; return plain once at creation.
 */
async function generateCredential(length = 16): Promise<GeneratedCredential> {
  const plain = crypto.randomBytes(length).toString('base64url').slice(0, length);
  const hashed = await bcrypt.hash(plain, 10);
  return { plain, hashed };
}

/**
 * Derive a safe FTP username from a domain string.
 * POSIX user names: lowercase, alphanumeric + underscore, max 32 chars.
 */
function ftpUsernameFromDomain(domain: string): string {
  return domain
    .replace(/\./g, '_')
    .replace(/[^a-z0-9_]/gi, '')
    .toLowerCase()
    .slice(0, 32);
}

/**
 * Derive a MySQL-safe identifier (database name / user name) from a domain.
 * MySQL user names max 32 chars; db names practical limit ~64.
 */
function dbIdentifierFromDomain(domain: string): string {
  return domain
    .replace(/\./g, '_')
    .replace(/[^a-z0-9_]/gi, '')
    .toLowerCase()
    .slice(0, 32);
}

/**
 * Build the document root path for a given account id.
 * Path traversal is prevented by using only the cuid (alphanumeric).
 */
function buildDocumentRoot(accountId: string): string {
  // Validate accountId contains only safe characters (cuid format)
  if (!/^[a-z0-9]+$/i.test(accountId)) {
    throw new Error('Invalid account id');
  }
  return path.posix.join(WWW_BASE, accountId, 'public_html');
}

/**
 * Strip all hashed credential fields before returning an account to callers.
 * Plain-text credentials are ONLY returned once, at creation time.
 */
function sanitizeAccount<T extends { ftpPassword: unknown; dbPassword: unknown }>(
  account: T,
): SanitizedAccount<T> {
  const { ftpPassword, dbPassword, ...safe } = account;
  return safe;
}

class HostingService {
  // ---------------------------------------------------------------------------
  // Plans
  // ---------------------------------------------------------------------------

  /**
   * Return all active hosting plans, ordered cheapest first.
   */
  static async getPlans(): Promise<HostingPlan[]> {
    return prisma.hostingPlan.findMany({
      where: { isActive: true },
      orderBy: { monthlyPrice: 'asc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Account provisioning
  // ---------------------------------------------------------------------------

  /**
   * Provision a new hosting account for a user.
   *
   * @param userId  - authenticated user id
   * @param planId  - chosen HostingPlan id
   * @param domain - primary domain; omit to auto-assign <username>.sahary.cloud
   * @returns account — sanitized HostingAccount (no hashed passwords)
   *          credentials — plain-text ftp + db credentials (shown once only)
   */
  static async createAccount(userId: string, planId: string, domain?: string): Promise<CreateAccountResult> {
    // Validate plan
    const plan = await prisma.hostingPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      throw new Error('Hosting plan not found or inactive');
    }

    // Enforce one account per user (MVP)
    const existing = await prisma.hostingAccount.findFirst({ where: { userId } });
    if (existing) {
      throw new Error('User already has a hosting account');
    }

    // Auto-assign subdomain if no domain provided
    if (!domain) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user) throw new Error('User not found');
      const emailPrefix = user.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 32) || 'user';
      domain = await HostingService._uniqueSubdomain(emailPrefix);
    }

    // Domain uniqueness check (also enforced by DB unique index)
    const domainTaken = await prisma.hostingAccount.findUnique({ where: { domain } });
    if (domainTaken) {
      throw new Error('Domain is already in use');
    }

    // --- Generate credentials ---
    const ftpUser = ftpUsernameFromDomain(domain);

    // FTP username must also be unique — surface a clear error
    const ftpTaken = await prisma.hostingAccount.findUnique({ where: { ftpUser } });
    if (ftpTaken) {
      throw new Error('FTP username derived from this domain is already taken');
    }

    const ftpCred = await generateCredential();

    const dbBase = dbIdentifierFromDomain(domain);
    const dbName = dbBase;
    const dbUser = dbBase.slice(0, 16); // MySQL user name hard limit
    const dbCred = await generateCredential();

    // --- Create the record ---
    // We need the id to build the document root, so generate it upfront via cuid.
    // Prisma uses cuid() by default; we pre-generate to set documentRoot atomically.
    const { createId } = require('@paralleldrive/cuid2');
    const accountId: string = createId();
    const documentRoot = buildDocumentRoot(accountId);

    let account: HostingAccountWithRelations | undefined;
    try {
      account = await prisma.hostingAccount.create({
        data: {
          id: accountId,
          domain,
          documentRoot,
          diskQuota: plan.diskGB,
          bandwidthQuota: plan.bandwidthGB,
          status: 'ACTIVE',
          ftpUser,
          ftpPassword: ftpCred.hashed,
          dbName,
          dbUser,
          dbPassword: dbCred.hashed,
          userId,
          planId,
        },
        include: { plan: true, domains: true },
      });

      await VhostService.syncAccountVhost({
        primaryDomain: account.domain,
        customDomains: [],
        documentRoot: account.documentRoot as string,
      });
    } catch (error) {
      if (account?.id) {
        await prisma.hostingAccount.delete({ where: { id: account.id } });
      }
      throw error;
    }

    // Plain-text credentials returned ONCE — never persisted in plain form
    return {
      account: sanitizeAccount(account),
      credentials: {
        ftp: {
          host: domain,
          user: ftpUser,
          password: ftpCred.plain,
          port: 21,
        },
        db: {
          name: dbName,
          user: dbUser,
          password: dbCred.plain,
          host: 'localhost',
          port: 3306,
        },
      },
      documentRoot,
    };
  }

  /**
   * Fetch the current user's hosting account (sanitized — no hashed passwords).
   */
  static async getAccountByUser(userId: string): Promise<SanitizedAccount<HostingAccountWithRelations>> {
    const account = await prisma.hostingAccount.findFirst({
      where: { userId, status: { not: 'TERMINATED' } },
      include: { plan: true, domains: true },
    });
    if (!account) {
      throw new Error('No hosting account found');
    }
    return sanitizeAccount(account);
  }

  /**
   * Terminate (soft-delete) a hosting account.
   * Only the account owner may do this.
   */
  static async terminateAccount(accountId: string, userId: string): Promise<SanitizedAccount<HostingAccount>> {
    const account = await prisma.hostingAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new Error('Hosting account not found');
    }
    if (account.userId !== userId) {
      throw new Error('Forbidden');
    }
    if (account.status === 'TERMINATED') {
      throw new Error('Account is already terminated');
    }

    await VhostService.removeAccountVhost(account.domain);

    const updated = await prisma.hostingAccount.update({
      where: { id: accountId },
      data: { status: 'TERMINATED', terminatedAt: new Date() },
    });
    return sanitizeAccount(updated);
  }

  // ---------------------------------------------------------------------------
  // Custom domain management
  // ---------------------------------------------------------------------------

  /**
   * List all custom domains attached to the user's account.
   */
  static async getDomains(userId: string): Promise<HostingDomain[]> {
    const account = await HostingService._requireActiveAccount(userId);
    return prisma.hostingDomain.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Add a custom domain to the user's account.
   * Returns the domain record including the DNS TXT verifyToken.
   */
  static async addDomain(userId: string, domain: string): Promise<HostingDomain> {
    const account = await HostingService._requireActiveAccount(userId);

    // Check plan domain limit
    const currentCount = await prisma.hostingDomain.count({
      where: { accountId: account.id },
    });
    if (currentCount >= account.plan.maxDomains) {
      throw new Error(`Domain limit reached for your plan (max ${account.plan.maxDomains})`);
    }

    // Uniqueness check
    const taken = await prisma.hostingDomain.findUnique({ where: { domain } });
    if (taken) {
      throw new Error('Domain is already registered on this platform');
    }

    const verifyToken = crypto.randomBytes(24).toString('hex');

    const created = await prisma.hostingDomain.create({
      data: {
        domain,
        verifyToken,
        accountId: account.id,
      },
    });

    try {
      const customDomains = await HostingService._getCustomDomains(account.id);
      await VhostService.syncAccountVhost({
        primaryDomain: account.domain,
        customDomains,
        documentRoot: account.documentRoot as string,
      });
    } catch (error) {
      await prisma.hostingDomain.delete({ where: { id: created.id } });
      throw error;
    }

    return created;
  }

  /**
   * Remove a custom domain from the user's account.
   */
  static async removeDomain(userId: string, domainId: string): Promise<void> {
    const account = await HostingService._requireActiveAccount(userId);

    const record = await prisma.hostingDomain.findUnique({ where: { id: domainId } });
    if (!record) {
      throw new Error('Domain not found');
    }
    if (record.accountId !== account.id) {
      throw new Error('Forbidden');
    }

    await prisma.hostingDomain.delete({ where: { id: domainId } });

    try {
      const customDomains = await HostingService._getCustomDomains(account.id);
      await VhostService.syncAccountVhost({
        primaryDomain: account.domain,
        customDomains,
        documentRoot: account.documentRoot as string,
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
          accountId: record.accountId,
        },
      });
      throw error;
    }
  }

  /**
   * Verify domain ownership by checking for the DNS TXT record.
   * The user must have added `sahary-verify=<verifyToken>` as a TXT record.
   */
  static async verifyDomain(userId: string, domainId: string): Promise<HostingDomain> {
    const account = await HostingService._requireActiveAccount(userId);

    const record = await prisma.hostingDomain.findUnique({ where: { id: domainId } });
    if (!record) throw new Error('Domain not found');
    if (record.accountId !== account.id) throw new Error('Forbidden');
    if (record.isVerified) return record; // already verified

    let txtRecords: string[][];
    try {
      txtRecords = await dns.resolveTxt(record.domain);
    } catch {
      throw new Error('DNS lookup failed — make sure the TXT record has propagated');
    }

    const flat = txtRecords.flat();
    const expected = `sahary-verify=${record.verifyToken}`;
    if (!flat.includes(expected)) {
      throw new Error('TXT record not found — add the verification record and try again');
    }

    const updated = await prisma.hostingDomain.update({
      where: { id: domainId },
      data: { isVerified: true },
    });

    const customDomains = await HostingService._getCustomDomains(account.id);
    await VhostService.syncAccountVhost({
      primaryDomain: account.domain,
      customDomains,
      documentRoot: account.documentRoot as string,
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique `<prefix>.sahary.cloud` subdomain, appending a numeric
   * suffix if the base is already taken.
   */
  static async _uniqueSubdomain(prefix: string): Promise<string> {
    let candidate = `${prefix}.${BASE_DOMAIN}`;
    let taken = await prisma.hostingAccount.findUnique({ where: { domain: candidate } });
    let i = 2;
    while (taken) {
      candidate = `${prefix}${i}.${BASE_DOMAIN}`;
      taken = await prisma.hostingAccount.findUnique({ where: { domain: candidate } });
      i++;
    }
    return candidate;
  }

  static async _requireActiveAccount(userId: string): Promise<HostingAccountWithPlan> {
    const account = await prisma.hostingAccount.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
    });
    if (!account) {
      throw new Error('No active hosting account found');
    }
    return account;
  }

  static async _getCustomDomains(accountId: string): Promise<string[]> {
    const records = await prisma.hostingDomain.findMany({
      where: { accountId, isVerified: true },
      select: { domain: true },
    });
    return records.map((r) => r.domain);
  }
}

export = HostingService;
