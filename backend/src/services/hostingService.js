const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const dns = require('dns').promises;
const path = require('path');

const prisma = new PrismaClient();

// Base directory where all hosting document roots live.
// In production this is a real path on the server that Nginx serves.
const WWW_BASE = process.env.HOSTING_WWW_BASE || '/var/www';

// The platform's base domain for auto-assigned subdomains.
const BASE_DOMAIN = process.env.HOSTING_BASE_DOMAIN || 'sahary.cloud';

/**
 * Generate a cryptographically random password.
 * Returns { plain, hashed } — store only the hash; return plain once at creation.
 */
async function generateCredential(length = 16) {
  const plain = crypto.randomBytes(length).toString('base64url').slice(0, length);
  const hashed = await bcrypt.hash(plain, 10);
  return { plain, hashed };
}

/**
 * Derive a safe FTP username from a domain string.
 * POSIX user names: lowercase, alphanumeric + underscore, max 32 chars.
 */
function ftpUsernameFromDomain(domain) {
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
function dbIdentifierFromDomain(domain) {
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
function buildDocumentRoot(accountId) {
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
function sanitizeAccount(account) {
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
  static async getPlans() {
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
   * @param {string} userId  - authenticated user id
   * @param {string} planId  - chosen HostingPlan id
   * @param {string} [domain] - primary domain; omit to auto-assign <username>.sahary.cloud
   * @returns {{ account: object, credentials: object }}
   *          account — sanitized HostingAccount (no hashed passwords)
   *          credentials — plain-text ftp + db credentials (shown once only)
   */
  static async createAccount(userId, planId, domain) {
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
    const accountId = createId();
    const documentRoot = buildDocumentRoot(accountId);

    const account = await prisma.hostingAccount.create({
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
  static async getAccountByUser(userId) {
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
  static async terminateAccount(accountId, userId) {
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
  static async getDomains(userId) {
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
  static async addDomain(userId, domain) {
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

    return prisma.hostingDomain.create({
      data: {
        domain,
        verifyToken,
        accountId: account.id,
      },
    });
  }

  /**
   * Remove a custom domain from the user's account.
   */
  static async removeDomain(userId, domainId) {
    const account = await HostingService._requireActiveAccount(userId);

    const record = await prisma.hostingDomain.findUnique({ where: { id: domainId } });
    if (!record) {
      throw new Error('Domain not found');
    }
    if (record.accountId !== account.id) {
      throw new Error('Forbidden');
    }

    await prisma.hostingDomain.delete({ where: { id: domainId } });
  }

  /**
   * Verify domain ownership by checking for the DNS TXT record.
   * The user must have added `sahary-verify=<verifyToken>` as a TXT record.
   */
  static async verifyDomain(userId, domainId) {
    const account = await HostingService._requireActiveAccount(userId);

    const record = await prisma.hostingDomain.findUnique({ where: { id: domainId } });
    if (!record) throw new Error('Domain not found');
    if (record.accountId !== account.id) throw new Error('Forbidden');
    if (record.isVerified) return record; // already verified

    let txtRecords;
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

    return prisma.hostingDomain.update({
      where: { id: domainId },
      data: { isVerified: true },
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique `<prefix>.sahary.cloud` subdomain, appending a numeric
   * suffix if the base is already taken.
   */
  static async _uniqueSubdomain(prefix) {
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

  static async _requireActiveAccount(userId) {
    const account = await prisma.hostingAccount.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
    });
    if (!account) {
      throw new Error('No active hosting account found');
    }
    return account;
  }
}

module.exports = HostingService;
