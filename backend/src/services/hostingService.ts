// @ts-nocheck
const { prisma } = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const dns = require('dns').promises;
const fs = require('fs').promises;
const path = require('path');
const VhostService = require('./vhostService');
const logger = require('../utils/logger').default;

// Base directory where all hosting document roots live.
// In production this is a real path on the server that Nginx serves.
const WWW_BASE = process.env.HOSTING_WWW_BASE || '/var/www';

// The platform's base domain for auto-assigned subdomains.
const BASE_DOMAIN = process.env.HOSTING_BASE_DOMAIN || 'sahary.cloud';

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

// First labels under BASE_DOMAIN reserved for the platform itself.
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'mail', 'app', 'admin', 'status', 'ns', 'ftp', 'cpanel']);

// Holding page written into freshly provisioned document roots.
const DEFAULT_INDEX_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Hosting account provisioned</title></head>
<body><h1>Your site is ready</h1><p>Replace this page with your own content.</p></body>
</html>
`;

/**
 * Error annotated with an HTTP status and a safe-to-expose flag so the
 * controller layer can map it without substring matching or leaking internals.
 */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

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
 * Strip all hashed credential fields and internal paths before returning an
 * account to callers. Plain-text credentials are ONLY returned once, at
 * creation time.
 */
function sanitizeAccount(account) {
  const {
    ftpPassword, dbPassword, documentRoot, ...safe
  } = account;
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
   * @param {string} [domain] - external domain to attach; parked unverified until
   *          DNS TXT verification succeeds. The primary domain is always an
   *          auto-assigned <username>.sahary.cloud subdomain.
   * @returns {{ account: object, credentials: object, pendingDomain?: object }}
   *          account — sanitized HostingAccount (no hashed passwords)
   *          credentials — plain-text ftp + db credentials (shown once only)
   *          pendingDomain — unverified HostingDomain row carrying verifyToken
   */
  static async createAccount(userId, planId, domain) {
    // Validate plan
    const plan = await prisma.hostingPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      throw httpError(400, 'Hosting plan not found or inactive');
    }

    // Enforce one non-terminated account per user (MVP). TERMINATED accounts
    // release their unique fields and never block re-provisioning.
    const existing = await prisma.hostingAccount.findFirst({
      where: { userId, status: { not: 'TERMINATED' } },
    });
    if (existing) {
      throw httpError(409, 'User already has a hosting account');
    }

    // A user-supplied external domain is NOT trusted into server_name yet:
    // it is parked as an unverified HostingDomain row and only emitted in the
    // vhost after the standard DNS TXT verification succeeds. Until then the
    // platform subdomain serves a default holding page.
    let externalDomain = null;
    if (domain) {
      externalDomain = String(domain).toLowerCase().trim();
      HostingService._assertClaimableDomain(externalDomain);
      if (await HostingService._isDomainTaken(externalDomain)) {
        throw httpError(409, 'Domain is already in use');
      }
    }

    // The primary domain is always an auto-assigned platform subdomain.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) throw httpError(404, 'User not found');
    const emailPrefix = user.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 32) || 'user';
    domain = await HostingService._uniqueSubdomain(emailPrefix);

    // --- Generate credentials ---
    const ftpUser = ftpUsernameFromDomain(domain);

    // FTP username must also be unique — surface a clear error
    const ftpTaken = await prisma.hostingAccount.findUnique({ where: { ftpUser } });
    if (ftpTaken) {
      throw httpError(409, 'FTP username derived from this domain is already taken');
    }

    const ftpCred = await generateCredential();

    // Pre-generate the id via crypto.randomUUID (no extra dependency) so the
    // document root and db identifiers can embed it atomically.
    const accountId = crypto.randomUUID().replace(/-/g, '');
    const documentRoot = buildDocumentRoot(accountId);

    // MySQL identifiers incorporate the account id so look-alike domains
    // (a-bc.com vs abc.com) can never collide.
    const dbSuffix = accountId.slice(0, 8);
    const dbBase = dbIdentifierFromDomain(domain);
    const dbName = `${dbBase}_${dbSuffix}`.slice(0, 64);
    const dbUser = `${dbBase.slice(0, 7)}_${dbSuffix}`.slice(0, 16); // MySQL user name hard limit
    const dbCred = await generateCredential();

    let account;
    let pendingDomain = null;
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

      if (externalDomain) {
        pendingDomain = await prisma.hostingDomain.create({
          data: {
            domain: externalDomain,
            verifyToken: crypto.randomBytes(24).toString('hex'),
            accountId: account.id,
          },
        });
      }

      // Provision the document root (best effort — the filesystem may not be
      // local to this process, so failure must not abort account creation).
      try {
        await fs.mkdir(documentRoot, { recursive: true });
        try {
          await fs.writeFile(path.posix.join(documentRoot, 'index.html'), DEFAULT_INDEX_HTML, {
            encoding: 'utf8',
            mode: 0o644,
            flag: 'wx',
          });
        } catch (writeError) {
          if (writeError.code !== 'EEXIST') throw writeError;
        }
      } catch (fsError) {
        logger.warn('Document root provisioning skipped (filesystem unavailable)', {
          documentRoot,
          message: fsError.message,
        });
      }

      await VhostService.syncAccountVhost({
        primaryDomain: account.domain,
        customDomains: [],
        documentRoot: account.documentRoot,
      });
    } catch (error) {
      // Roll back: remove any vhost files (idempotent) and the DB row.
      try {
        await VhostService.removeAccountVhost(domain);
      } catch (cleanupError) {
        logger.warn('Vhost cleanup after failed provisioning failed', {
          domain,
          message: cleanupError.message,
        });
      }
      if (account?.id) {
        try {
          await prisma.hostingAccount.delete({ where: { id: account.id } });
        } catch (deleteError) {
          logger.error('Account rollback failed', {
            accountId: account.id,
            message: deleteError.message,
          });
        }
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
      ...(pendingDomain ? { pendingDomain } : {}),
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
      throw httpError(404, 'No hosting account found');
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
      throw httpError(404, 'Hosting account not found');
    }
    if (account.userId !== userId) {
      throw httpError(403, 'Forbidden');
    }
    if (account.status === 'TERMINATED') {
      throw httpError(409, 'Account is already terminated');
    }

    // Mark TERMINATED first and release the unique fields (domain, ftpUser)
    // so a failed cleanup can neither block re-provisioning nor squat names.
    const [updated] = await prisma.$transaction([
      prisma.hostingAccount.update({
        where: { id: accountId },
        data: {
          status: 'TERMINATED',
          terminatedAt: new Date(),
          domain: `${account.domain}_terminated_${account.id}`,
          ftpUser: account.ftpUser ? `${account.ftpUser}_terminated_${account.id}` : account.ftpUser,
        },
      }),
      prisma.hostingDomain.deleteMany({ where: { accountId } }),
    ]);

    // Best-effort external cleanup — failures are logged, never fatal.
    try {
      await VhostService.removeAccountVhost(account.domain);
    } catch (error) {
      logger.error('Failed to remove vhost during account termination', {
        accountId,
        domain: account.domain,
        message: error.message,
      });
    }

    const accountDir = account.documentRoot ? path.posix.dirname(account.documentRoot) : null;
    if (accountDir && accountDir.startsWith(`${WWW_BASE}/`)) {
      try {
        await fs.rm(accountDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn('Failed to remove document root during termination', {
          accountId,
          documentRoot: account.documentRoot,
          message: error.message,
        });
      }
    }

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

    domain = String(domain).toLowerCase().trim();
    HostingService._assertClaimableDomain(domain);

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
        tx.hostingAccount.findUnique({ where: { domain } }),
        tx.hostingDomain.findUnique({ where: { domain } }),
      ]);
      if (accountHit || domainHit) {
        throw httpError(409, 'Domain is already registered on this platform');
      }

      return tx.hostingDomain.create({
        data: {
          domain,
          verifyToken,
          accountId: account.id,
        },
      });
    });

    try {
      const customDomains = await HostingService._getCustomDomains(account.id);
      await VhostService.syncAccountVhost({
        primaryDomain: account.domain,
        customDomains,
        documentRoot: account.documentRoot,
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
  static async removeDomain(userId, domainId) {
    const account = await HostingService._requireActiveAccount(userId);

    const record = await prisma.hostingDomain.findUnique({ where: { id: domainId } });
    if (!record) {
      throw httpError(404, 'Domain not found');
    }
    if (record.accountId !== account.id) {
      throw httpError(403, 'Forbidden');
    }

    await prisma.hostingDomain.delete({ where: { id: domainId } });

    try {
      const customDomains = await HostingService._getCustomDomains(account.id);
      await VhostService.syncAccountVhost({
        primaryDomain: account.domain,
        customDomains,
        documentRoot: account.documentRoot,
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
          createdAt: record.createdAt,
        },
      });
      throw error;
    }
  }

  /**
   * Verify domain ownership by checking for the DNS TXT record.
   * The user must have added `sahary-verify=<verifyToken>` as a TXT record.
   */
  static async verifyDomain(userId, domainId) {
    const account = await HostingService._requireActiveAccount(userId);

    const record = await prisma.hostingDomain.findUnique({ where: { id: domainId } });
    if (!record) throw httpError(404, 'Domain not found');
    if (record.accountId !== account.id) throw httpError(403, 'Forbidden');
    if (record.isVerified) return record; // already verified

    let txtRecords;
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
      const customDomains = await HostingService._getCustomDomains(account.id);
      await VhostService.syncAccountVhost({
        primaryDomain: account.domain,
        customDomains,
        documentRoot: account.documentRoot,
      });
    } catch (error) {
      await prisma.hostingDomain.update({
        where: { id: domainId },
        data: { isVerified: false },
      });
      throw error;
    }

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Reject domains a tenant may never claim: the platform's own base domain,
   * any platform subdomain (including reserved labels), and malformed input.
   * External domains are additionally gated by DNS TXT verification.
   */
  static _assertClaimableDomain(domain) {
    const lower = String(domain || '').toLowerCase().trim();
    if (lower.length > 253 || !DOMAIN_REGEX.test(lower)) {
      throw httpError(400, 'Invalid domain format');
    }
    if (lower === BASE_DOMAIN) {
      throw httpError(400, 'The platform base domain cannot be claimed');
    }
    if (lower.endsWith(`.${BASE_DOMAIN}`)) {
      const firstLabel = lower.split('.')[0];
      if (RESERVED_SUBDOMAINS.has(firstLabel)) {
        throw httpError(400, `The '${firstLabel}.${BASE_DOMAIN}' subdomain is reserved`);
      }
      throw httpError(400, 'Platform-managed domains cannot be claimed');
    }
  }

  /**
   * Cross-table uniqueness: a domain claimed as an account primary OR as a
   * custom domain on ANY account is unavailable — otherwise the same
   * server_name in two accounts allows an nginx first-match hijack.
   */
  static async _isDomainTaken(domain) {
    const [accountHit, domainHit] = await Promise.all([
      prisma.hostingAccount.findUnique({ where: { domain } }),
      prisma.hostingDomain.findUnique({ where: { domain } }),
    ]);
    return Boolean(accountHit || domainHit);
  }

  /**
   * Generate a unique `<prefix>.sahary.cloud` subdomain, appending a numeric
   * suffix if the base is already taken or reserved for the platform.
   */
  static async _uniqueSubdomain(prefix) {
    let candidate = `${prefix}.${BASE_DOMAIN}`;
    let i = 2;
    while (
      RESERVED_SUBDOMAINS.has(candidate.split('.')[0])
      || (await HostingService._isDomainTaken(candidate))
    ) {
      candidate = `${prefix}${i}.${BASE_DOMAIN}`;
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
      throw httpError(404, 'No active hosting account found');
    }
    return account;
  }

  static async _getCustomDomains(accountId) {
    const records = await prisma.hostingDomain.findMany({
      where: { accountId, isVerified: true },
      select: { domain: true },
    });
    return records.map((r) => r.domain);
  }
}

module.exports = HostingService;
