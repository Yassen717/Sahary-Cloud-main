const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

/**
 * Generate a random password and return it in plain + hashed form.
 */
async function generateCredential(length = 16) {
  const plain = crypto.randomBytes(length).toString('base64url').slice(0, length);
  const hashed = await bcrypt.hash(plain, 10);
  return { plain, hashed };
}

/**
 * Derive FTP username from the account domain (safe, lowercase, max 32 chars).
 */
function ftpUsernameFromDomain(domain) {
  return domain
    .replace(/\./g, '_')
    .replace(/[^a-z0-9_]/gi, '')
    .toLowerCase()
    .slice(0, 32);
}

/**
 * Derive a MySQL-safe DB / DB-user name from the account domain.
 */
function dbNameFromDomain(domain) {
  return domain
    .replace(/\./g, '_')
    .replace(/[^a-z0-9_]/gi, '')
    .toLowerCase()
    .slice(0, 32);
}

class HostingService {
  /**
   * Return all active hosting plans.
   */
  static async getPlans() {
    return prisma.hostingPlan.findMany({
      where: { isActive: true },
      orderBy: { monthlyPrice: 'asc' },
    });
  }

  /**
   * Provision a new hosting account for a user.
   * @param {string} userId
   * @param {string} planId
   * @param {string} domain  - fully-qualified domain or subdomain
   */
  static async createAccount(userId, planId, domain) {
    // Validate plan exists
    const plan = await prisma.hostingPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      throw new Error('Hosting plan not found or inactive');
    }

    // Enforce one account per user (MVP scope)
    const existing = await prisma.hostingAccount.findFirst({ where: { userId } });
    if (existing) {
      throw new Error('User already has a hosting account');
    }

    // Check domain uniqueness
    const domainTaken = await prisma.hostingAccount.findUnique({ where: { domain } });
    if (domainTaken) {
      throw new Error('Domain is already in use');
    }

    // Generate FTP credentials
    const ftpUser = ftpUsernameFromDomain(domain);
    const ftpCred = await generateCredential();

    // Generate DB credentials
    const dbBase = dbNameFromDomain(domain);
    const dbName = dbBase;
    const dbUser = dbBase.slice(0, 16); // MySQL user name limit
    const dbCred = await generateCredential();

    const account = await prisma.hostingAccount.create({
      data: {
        domain,
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
      include: { plan: true },
    });

    // Return plain-text credentials only at creation time — never stored in plain form
    return {
      account,
      credentials: {
        ftp: { user: ftpUser, password: ftpCred.plain },
        db: { name: dbName, user: dbUser, password: dbCred.plain },
      },
    };
  }

  /**
   * Fetch the hosting account for the given user (with plan info).
   */
  static async getAccountByUser(userId) {
    const account = await prisma.hostingAccount.findFirst({
      where: { userId },
      include: { plan: true },
    });
    if (!account) {
      throw new Error('No hosting account found');
    }
    return account;
  }

  /**
   * Terminate (soft-delete) a hosting account.
   * Only the owner may terminate their account.
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

    return prisma.hostingAccount.update({
      where: { id: accountId },
      data: {
        status: 'TERMINATED',
        terminatedAt: new Date(),
      },
    });
  }
}

module.exports = HostingService;
