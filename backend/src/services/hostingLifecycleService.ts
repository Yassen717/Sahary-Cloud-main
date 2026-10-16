import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { HostingAccount, HostingDomain, HostingPlan } from '@prisma/client';
import { prisma } from '../config/database';
import { getHostingConfig } from '../config/hosting';
import { httpError } from '../utils/httpError';
import logger from '../utils/logger';
import type {
  HostingAccountDTO,
  ProvisionPaidAccountInput,
  SuspendReason,
} from '../types/hosting';
import { toAccountDTO } from './hostingDto';
import { accountDocumentRoot, mysqlPrimaryDbFor, mysqlUserFor } from './hostingNaming';
import {
  _assertClaimableDomain,
  _getCustomDomains,
  _isDomainTaken,
  _uniqueSubdomain,
  ftpUsernameFromDomain,
  subdomainPrefixFromEmail,
} from './hostingService';
import * as mysqlProvisionService from './mysqlProvisionService';
import * as ftpService from './ftpService';
import * as sslService from './sslService';
import * as stripeBillingService from './stripeBillingService';
import * as hostingNotificationService from './hostingNotificationService';

// Legacy @ts-nocheck CJS module (owned by WP05) — require() + typed surface.
const VhostService = require('./vhostService') as {
  syncAccountVhost(input: {
    primaryDomain: string;
    customDomains: string[];
    documentRoot: string;
  }): Promise<unknown>;
  removeAccountVhost(primaryDomain: string): Promise<unknown>;
};

// Holding page written into freshly provisioned document roots.
const DEFAULT_INDEX_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Hosting account provisioned</title></head>
<body><h1>Your site is ready</h1><p>Replace this page with your own content.</p></body>
</html>
`;

type AccountWithRelations = HostingAccount & { plan: HostingPlan; domains: HostingDomain[] };

const ACCOUNT_INCLUDE = { plan: true, domains: true } as const;

const errMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error));

const loadAccount = async (accountId: string): Promise<AccountWithRelations> => {
  const account = await prisma.hostingAccount.findUnique({
    where: { id: accountId },
    include: ACCOUNT_INCLUDE,
  });
  if (!account) {
    throw httpError(404, 'Hosting account not found');
  }
  return account;
};

// ---------------------------------------------------------------------------
// Provisioning helpers
// ---------------------------------------------------------------------------

/**
 * Strip path-looking and credential-looking tokens so a stored
 * provisioningError can be shown to admins/users without leaking internals.
 */
const sanitizeProvisioningError = (error: unknown): string => {
  const scrubbed = errMessage(error)
    .split(/\s+/)
    .map((token) => {
      const looksLikePath = token.length > 2 && (token.includes('/') || token.includes('\\') || /^[A-Za-z]:/.test(token));
      const looksLikeSecret = /pass(word)?|secret|token|key=/i.test(token);
      return looksLikePath || looksLikeSecret ? '[redacted]' : token;
    })
    .join(' ');
  return scrubbed.slice(0, 200);
};

const utcMonthStart = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/**
 * Create the document root and the holding index.html. Idempotent: mkdir -p
 * semantics and the index file is never overwritten once it exists.
 * The step is FATAL when nginx is enabled or NODE_ENV=production — a working
 * site is part of the paid product. Otherwise it degrades to a warning so
 * dev/test environments without a web root can still provision accounts.
 */
const ensureDocumentRoot = async (documentRoot: string): Promise<void> => {
  const cfg = getHostingConfig();
  const fatal = cfg.nginx.enabled || process.env.NODE_ENV === 'production';
  try {
    await fs.mkdir(documentRoot, { recursive: true });
    try {
      await fs.writeFile(path.join(documentRoot, 'index.html'), DEFAULT_INDEX_HTML, {
        encoding: 'utf8',
        mode: 0o644,
        flag: 'wx',
      });
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw writeError;
      }
    }
  } catch (error) {
    if (fatal) {
      throw error;
    }
    logger.warn('Document root provisioning skipped (filesystem unavailable)', {
      documentRoot,
      message: errMessage(error),
    });
  }
};

// Notification helpers must never change lifecycle outcomes.
const safeNotify = async (op: () => Promise<void>, label: string): Promise<void> => {
  try {
    await op();
  } catch (error) {
    logger.warn(`Notification ${label} failed`, { message: errMessage(error) });
  }
};

const upsertPrimaryDatabaseRow = async (accountId: string, dbName: string): Promise<void> => {
  const existing = await prisma.hostingDatabase.findUnique({ where: { name: dbName } });
  if (existing) {
    return;
  }
  try {
    await prisma.hostingDatabase.create({
      data: { name: dbName, isPrimary: true, accountId },
    });
  } catch (error) {
    // Racing retry — the row appeared between check and create.
    if ((error as { code?: string }).code !== 'P2002') {
      throw error;
    }
  }
};

/**
 * Park a user-requested external domain as an unverified HostingDomain row.
 * Never fatal: an unclaimable or already-taken domain is skipped with a
 * warning so a bad signup input cannot fail paid provisioning.
 */
const parkRequestedDomain = async (accountId: string, requestedDomain: string): Promise<void> => {
  const domain = String(requestedDomain).toLowerCase().trim();
  try {
    _assertClaimableDomain(domain);
    if (await _isDomainTaken(domain)) {
      throw httpError(409, 'Domain is already in use');
    }
  } catch (error) {
    logger.warn('Requested domain skipped during provisioning', {
      domain,
      message: errMessage(error),
    });
    return;
  }

  const existing = await prisma.hostingDomain.findUnique({ where: { domain } });
  if (existing) {
    return;
  }
  try {
    await prisma.hostingDomain.create({
      data: {
        domain,
        verifyToken: crypto.randomBytes(24).toString('hex'),
        accountId,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') {
      throw error;
    }
  }
};

// PROVISION_FAILED -> PROVISIONING before the pipeline reruns (contract P1).
const markProvisioning = async (accountId: string): Promise<void> => {
  await prisma.hostingAccount.update({
    where: { id: accountId },
    data: { status: 'PROVISIONING', provisioningError: null },
  });
};

/**
 * The resumable provisioning pipeline (contract P2). Every step uses
 * IF-NOT-EXISTS semantics so a retried run converges to ACTIVE without
 * duplicating resources. On failure the row is marked PROVISION_FAILED with
 * a sanitized error and the original error is rethrown so callers (e.g. the
 * Stripe webhook) can retry.
 */
const runProvisioningPipeline = async (accountId: string): Promise<AccountWithRelations> => {
  const account = await loadAccount(accountId);

  try {
    // 1. Document root + holding page.
    if (account.documentRoot) {
      await ensureDocumentRoot(account.documentRoot);
    }

    // 2. MySQL user + primary database (+ HostingDatabase primary row).
    if (mysqlProvisionService.isMysqlEnabled() && account.dbUser && account.dbName) {
      // Random password is used once to create the user and then discarded —
      // a reveal happens only through the reset endpoint (bcrypt stored then).
      const dbPassword = crypto.randomBytes(18).toString('base64url');
      await mysqlProvisionService.ensureAccountUser(account.dbUser, dbPassword);
      await mysqlProvisionService.ensureDatabase(account.dbName, account.dbUser);
      await upsertPrimaryDatabaseRow(account.id, account.dbName);
    }

    // 3. FTP user.
    if (ftpService.isFtpEnabled() && account.ftpUser && account.documentRoot) {
      await ftpService.provisionFtpUser({
        username: account.ftpUser,
        documentRoot: account.documentRoot,
        quotaMB: account.plan.diskGB * 1024,
      });
    }

    // 4. Primary SSL state comes from the operator-provided wildcard cert:
    //    available => HTTPS on the platform subdomain; absent => HTTP-only.
    const wildcard = sslService.getWildcardStatus();
    await prisma.hostingAccount.update({
      where: { id: account.id },
      data: { sslEnabled: wildcard.available, sslExpiresAt: wildcard.expiresAt },
    });

    // 5. Web server vhost (no-op stub when HOSTING_NGINX_ENABLED=false).
    await VhostService.syncAccountVhost({
      primaryDomain: account.domain,
      customDomains: await _getCustomDomains(account.id),
      documentRoot: account.documentRoot ?? '',
    });

    // 6. Activate + notify.
    const activated = await prisma.hostingAccount.update({
      where: { id: account.id },
      data: { status: 'ACTIVE', provisioningError: null },
      include: ACCOUNT_INCLUDE,
    });
    await safeNotify(
      () => hostingNotificationService.notifyAccountProvisioned(account.id),
      'notifyAccountProvisioned',
    );
    return activated;
  } catch (error) {
    try {
      await prisma.hostingAccount.update({
        where: { id: account.id },
        data: {
          status: 'PROVISION_FAILED',
          provisioningError: sanitizeProvisioningError(error),
        },
      });
    } catch (markError) {
      logger.error('Failed to mark account PROVISION_FAILED', {
        accountId: account.id,
        message: errMessage(markError),
      });
    }
    throw error;
  }
};

interface CreateProvisioningRowInput {
  userId: string;
  plan: HostingPlan;
  userEmail: string;
  requestedDomain?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: Date | null;
}

/**
 * Create the PROVISIONING account row with quota/subscription fields, then
 * park the requested domain. Shared by the paid (webhook) and unpaid
 * (dev/test) entry points.
 */
const createProvisioningRow = async (
  input: CreateProvisioningRowInput,
): Promise<AccountWithRelations> => {
  const cfg = getHostingConfig();
  const domain = await _uniqueSubdomain(subdomainPrefixFromEmail(input.userEmail));
  const accountId = crypto.randomUUID().replace(/-/g, '');
  const documentRoot = accountDocumentRoot(cfg.wwwBase, accountId);
  const ftpUser = ftpUsernameFromDomain(domain);

  const ftpTaken = await prisma.hostingAccount.findUnique({ where: { ftpUser } });
  if (ftpTaken) {
    throw httpError(409, 'FTP username derived from this domain is already taken');
  }

  const account = await prisma.hostingAccount.create({
    data: {
      id: accountId,
      domain,
      documentRoot,
      diskQuota: input.plan.diskGB,
      bandwidthQuota: input.plan.bandwidthGB,
      status: 'PROVISIONING',
      ftpUser,
      dbName: mysqlPrimaryDbFor(accountId),
      dbUser: mysqlUserFor(accountId),
      userId: input.userId,
      planId: input.plan.id,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      subscriptionStatus: input.subscriptionStatus ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      bandwidthCycleStart: utcMonthStart(new Date()),
    },
    include: ACCOUNT_INCLUDE,
  });

  if (input.requestedDomain) {
    await parkRequestedDomain(account.id, input.requestedDomain);
  }

  return loadAccount(account.id);
};

// ---------------------------------------------------------------------------
// Provisioning entry points
// ---------------------------------------------------------------------------

export async function provisionPaidAccount(
  input: ProvisionPaidAccountInput,
): Promise<{ account: HostingAccountDTO; created: boolean }> {
  // Idempotent per Stripe subscription: an existing row means a delivery
  // retry — resume an unfinished pipeline, return finished ones untouched.
  const bySubscription = await prisma.hostingAccount.findUnique({
    where: { stripeSubscriptionId: input.stripeSubscriptionId },
    include: ACCOUNT_INCLUDE,
  });
  if (bySubscription) {
    if (bySubscription.status === 'PROVISIONING' || bySubscription.status === 'PROVISION_FAILED') {
      if (bySubscription.status === 'PROVISION_FAILED') {
        await markProvisioning(bySubscription.id);
      }
      const resumed = await runProvisioningPipeline(bySubscription.id);
      return { account: toAccountDTO(resumed), created: false };
    }
    return { account: toAccountDTO(bySubscription), created: false };
  }

  const plan = await prisma.hostingPlan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.isActive) {
    throw httpError(400, 'Hosting plan not found or inactive');
  }

  const existing = await prisma.hostingAccount.findFirst({
    where: { userId: input.userId, status: { not: 'TERMINATED' } },
  });
  if (existing) {
    logger.error('provisionPaidAccount refused: user already owns a non-terminated account', {
      userId: input.userId,
      existingAccountId: existing.id,
      stripeSubscriptionId: input.stripeSubscriptionId,
    });
    throw httpError(409, 'User already has a hosting account');
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, stripeCustomerId: true },
  });
  if (!user) {
    throw httpError(404, 'User not found');
  }
  if (user.stripeCustomerId !== input.stripeCustomerId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: input.stripeCustomerId },
    });
  }

  let account: AccountWithRelations;
  try {
    account = await createProvisioningRow({
      userId: input.userId,
      plan,
      userEmail: user.email,
      requestedDomain: input.requestedDomain,
      stripeSubscriptionId: input.stripeSubscriptionId,
      subscriptionStatus: input.subscriptionStatus,
      currentPeriodEnd: input.currentPeriodEnd,
    });
  } catch (error) {
    // A racing delivery created the row between our check and insert — fall
    // back to the idempotent resume path instead of failing the webhook.
    if ((error as { code?: string }).code === 'P2002') {
      const raced = await prisma.hostingAccount.findUnique({
        where: { stripeSubscriptionId: input.stripeSubscriptionId },
        include: ACCOUNT_INCLUDE,
      });
      if (raced) {
        if (raced.status === 'PROVISIONING' || raced.status === 'PROVISION_FAILED') {
          if (raced.status === 'PROVISION_FAILED') {
            await markProvisioning(raced.id);
          }
          const resumed = await runProvisioningPipeline(raced.id);
          return { account: toAccountDTO(resumed), created: false };
        }
        return { account: toAccountDTO(raced), created: false };
      }
    }
    throw error;
  }

  const activated = await runProvisioningPipeline(account.id);
  return { account: toAccountDTO(activated), created: true };
}

export interface ProvisionUnpaidAccountInput {
  userId: string;
  planId: string;
  requestedDomain?: string;
}

/**
 * Dev/test escape hatch behind allowUnpaidAccounts — same pipeline as the
 * paid path but without subscription linkage, and it RESUMES the caller's
 * own unfinished (PROVISIONING | PROVISION_FAILED) account instead of 409.
 */
export async function provisionUnpaidAccount(
  input: ProvisionUnpaidAccountInput,
): Promise<HostingAccountDTO> {
  if (!getHostingConfig().allowUnpaidAccounts) {
    throw httpError(402, 'An active subscription is required. Subscribe to a plan first.');
  }

  const existing = await prisma.hostingAccount.findFirst({
    where: { userId: input.userId, status: { not: 'TERMINATED' } },
    include: ACCOUNT_INCLUDE,
  });
  if (existing) {
    if (existing.status === 'PROVISIONING' || existing.status === 'PROVISION_FAILED') {
      if (existing.status === 'PROVISION_FAILED') {
        await markProvisioning(existing.id);
      }
      const resumed = await runProvisioningPipeline(existing.id);
      return toAccountDTO(resumed);
    }
    throw httpError(409, 'User already has a hosting account');
  }

  const plan = await prisma.hostingPlan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.isActive) {
    throw httpError(400, 'Hosting plan not found or inactive');
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true },
  });
  if (!user) {
    throw httpError(404, 'User not found');
  }

  const account = await createProvisioningRow({
    userId: input.userId,
    plan,
    userEmail: user.email,
    requestedDomain: input.requestedDomain,
  });
  const activated = await runProvisioningPipeline(account.id);
  return toAccountDTO(activated);
}

// ---------------------------------------------------------------------------
// Suspension (contract P4) — reversible
// ---------------------------------------------------------------------------

export async function suspendAccount(
  accountId: string,
  reason: SuspendReason,
  opts?: { actorUserId?: string; note?: string },
): Promise<HostingAccountDTO> {
  const account = await loadAccount(accountId);

  if (account.status === 'SUSPENDED') {
    return toAccountDTO(account); // idempotent
  }
  if (account.status !== 'ACTIVE') {
    throw httpError(409, `Cannot suspend an account in status ${account.status}`);
  }

  // DB first: the row is the source of truth the vhost renderer reads.
  await prisma.hostingAccount.update({
    where: { id: account.id },
    data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendReason: reason },
  });

  try {
    await VhostService.syncAccountVhost({
      primaryDomain: account.domain,
      customDomains: await _getCustomDomains(account.id),
      documentRoot: account.documentRoot ?? '',
    });
  } catch (error) {
    logger.error('Vhost sync failed while suspending account', {
      accountId,
      actorUserId: opts?.actorUserId,
      message: errMessage(error),
    });
    throw httpError(502, 'Account suspended but the web server could not be updated');
  }

  // Access cut-offs are best-effort: logged, never thrown.
  if (ftpService.isFtpEnabled() && account.ftpUser) {
    try {
      await ftpService.setFtpUserEnabled(account.ftpUser, false);
    } catch (error) {
      logger.warn('Failed to disable FTP user during suspension', {
        accountId,
        message: errMessage(error),
      });
    }
  }
  if (mysqlProvisionService.isMysqlEnabled() && account.dbUser) {
    try {
      await mysqlProvisionService.setAccountUserLocked(account.dbUser, true);
    } catch (error) {
      logger.warn('Failed to lock MySQL user during suspension', {
        accountId,
        message: errMessage(error),
      });
    }
  }

  await safeNotify(
    () => hostingNotificationService.notifyAccountSuspended(account.id, reason),
    'notifyAccountSuspended',
  );

  return toAccountDTO(await loadAccount(account.id));
}

export async function activateAccount(
  accountId: string,
  opts?: { actorUserId?: string },
): Promise<HostingAccountDTO> {
  const account = await loadAccount(accountId);

  if (account.status === 'ACTIVE') {
    return toAccountDTO(account); // idempotent
  }
  if (account.status !== 'SUSPENDED') {
    throw httpError(409, `Cannot activate an account in status ${account.status}`);
  }

  await prisma.hostingAccount.update({
    where: { id: account.id },
    data: { status: 'ACTIVE', suspendedAt: null, suspendReason: null },
  });

  try {
    await VhostService.syncAccountVhost({
      primaryDomain: account.domain,
      customDomains: await _getCustomDomains(account.id),
      documentRoot: account.documentRoot ?? '',
    });
  } catch (error) {
    logger.error('Vhost sync failed while activating account', {
      accountId,
      actorUserId: opts?.actorUserId,
      message: errMessage(error),
    });
    throw httpError(502, 'Account activated but the web server could not be updated');
  }

  if (ftpService.isFtpEnabled() && account.ftpUser) {
    try {
      await ftpService.setFtpUserEnabled(account.ftpUser, true);
    } catch (error) {
      logger.warn('Failed to re-enable FTP user during activation', {
        accountId,
        message: errMessage(error),
      });
    }
  }
  if (mysqlProvisionService.isMysqlEnabled() && account.dbUser) {
    try {
      await mysqlProvisionService.setAccountUserLocked(account.dbUser, false);
    } catch (error) {
      logger.warn('Failed to unlock MySQL user during activation', {
        accountId,
        message: errMessage(error),
      });
    }
  }

  await safeNotify(
    () => hostingNotificationService.notifyAccountReactivated(account.id),
    'notifyAccountReactivated',
  );

  return toAccountDTO(await loadAccount(account.id));
}

// ---------------------------------------------------------------------------
// Plan change (quota application after the Stripe swap — see WP01/P3)
// ---------------------------------------------------------------------------

export async function changeAccountPlan(
  accountId: string,
  newPlanId: string,
): Promise<HostingAccountDTO> {
  const account = await loadAccount(accountId);
  if (account.status === 'TERMINATED') {
    throw httpError(409, 'Cannot change plan of a terminated account');
  }

  const plan = await prisma.hostingPlan.findUnique({ where: { id: newPlanId } });
  if (!plan || !plan.isActive) {
    throw httpError(400, 'Hosting plan not found or inactive');
  }

  if (account.planId === newPlanId) {
    return toAccountDTO(account); // idempotent
  }

  const updated = await prisma.hostingAccount.update({
    where: { id: account.id },
    data: { planId: plan.id, diskQuota: plan.diskGB, bandwidthQuota: plan.bandwidthGB },
    include: ACCOUNT_INCLUDE,
  });

  if (ftpService.isFtpEnabled() && updated.ftpUser) {
    try {
      await ftpService.setFtpQuota(updated.ftpUser, plan.diskGB * 1024);
    } catch (error) {
      logger.warn('Failed to update FTP quota after plan change', {
        accountId,
        message: errMessage(error),
      });
    }
  }

  // A bandwidth suspension lifts itself when the new quota covers usage.
  if (
    updated.status === 'SUSPENDED'
    && updated.suspendReason === 'BANDWIDTH_EXCEEDED'
    && updated.bandwidthUsed < plan.bandwidthGB
  ) {
    return activateAccount(accountId);
  }

  return toAccountDTO(updated);
}

// ---------------------------------------------------------------------------
// Subscription state projection (written by WP01's webhook/reconcile paths)
// ---------------------------------------------------------------------------

export async function applySubscriptionState(
  accountId: string,
  state: { subscriptionStatus: string; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean },
): Promise<void> {
  const account = await prisma.hostingAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    throw httpError(404, 'Hosting account not found');
  }
  await prisma.hostingAccount.update({
    where: { id: accountId },
    data: {
      subscriptionStatus: state.subscriptionStatus,
      currentPeriodEnd: state.currentPeriodEnd,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    },
  });
}

// ---------------------------------------------------------------------------
// Retry (PROVISION_FAILED -> PROVISIONING -> pipeline -> ACTIVE)
// ---------------------------------------------------------------------------

export async function retryProvisioning(
  accountId: string,
  opts?: { actorUserId?: string },
): Promise<HostingAccountDTO> {
  const account = await loadAccount(accountId);

  if (account.status === 'ACTIVE') {
    return toAccountDTO(account); // idempotent
  }
  if (account.status !== 'PROVISIONING' && account.status !== 'PROVISION_FAILED') {
    throw httpError(409, `Cannot retry provisioning for an account in status ${account.status}`);
  }

  if (account.status === 'PROVISION_FAILED') {
    await markProvisioning(account.id);
  }

  logger.info('Retrying account provisioning', {
    accountId,
    actorUserId: opts?.actorUserId,
    previousStatus: account.status,
  });

  const activated = await runProvisioningPipeline(account.id);
  return toAccountDTO(activated);
}

// ---------------------------------------------------------------------------
// Termination (contract P5) — terminal, docroot is moved to trash for the
// retention window instead of deleted outright.
// ---------------------------------------------------------------------------

const moveToTrash = async (account: HostingAccount): Promise<void> => {
  if (!account.documentRoot) {
    return;
  }
  const cfg = getHostingConfig();
  const accountDir = path.dirname(account.documentRoot);
  const rel = path.relative(path.resolve(cfg.wwwBase), path.resolve(accountDir));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    logger.warn('Refusing to trash document root outside HOSTING_WWW_BASE', {
      accountId: account.id,
      documentRoot: account.documentRoot,
    });
    return;
  }

  try {
    await fs.lstat(accountDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return; // nothing on disk — nothing to retain
    }
    throw error;
  }

  await fs.mkdir(cfg.trashDir, { recursive: true });
  const target = path.join(cfg.trashDir, `${account.id}-${Math.floor(Date.now() / 1000)}`);
  try {
    await fs.rename(accountDir, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
      throw error;
    }
    // Cross-device move: copy then remove.
    await fs.cp(accountDir, target, { recursive: true });
    await fs.rm(accountDir, { recursive: true, force: true });
  }
};

export async function terminateAccountById(
  accountId: string,
  opts: { actorUserId?: string; reason: 'USER' | 'ADMIN' | 'RETENTION_EXPIRED' | 'SUBSCRIPTION_ENDED' },
): Promise<HostingAccountDTO> {
  const account = await loadAccount(accountId);

  if (account.status === 'TERMINATED') {
    return toAccountDTO(account); // idempotent
  }
  if (opts.reason === 'USER' && account.userId !== opts.actorUserId) {
    throw httpError(403, 'Forbidden');
  }

  // (1) Cancel the Stripe subscription FIRST — if that fails we abort and
  //     touch nothing (the caller must be able to retry a paid resource).
  if (account.stripeSubscriptionId) {
    await stripeBillingService.cancelSubscriptionNow(account.stripeSubscriptionId);
  }

  // (2) Mark TERMINATED and release unique fields so a failed cleanup can
  //     neither block re-provisioning nor squat names.
  const customDomains = account.domains.map((d) => d.domain);
  await prisma.$transaction([
    prisma.hostingAccount.update({
      where: { id: account.id },
      data: {
        status: 'TERMINATED',
        terminatedAt: new Date(),
        domain: `${account.domain}_terminated_${account.id}`,
        ftpUser: account.ftpUser ? `${account.ftpUser}_terminated_${account.id}` : account.ftpUser,
      },
    }),
    prisma.hostingDomain.deleteMany({ where: { accountId: account.id } }),
  ]);

  // (3) External teardown — every step best-effort and logged.
  try {
    await VhostService.removeAccountVhost(account.domain);
  } catch (error) {
    logger.error('Failed to remove vhost during account termination', {
      accountId,
      domain: account.domain,
      message: errMessage(error),
    });
  }

  for (const domain of [account.domain, ...customDomains]) {
    try {
      await sslService.deleteCertificate(domain);
    } catch (error) {
      logger.warn('Failed to delete certificate during termination', {
        accountId,
        domain,
        message: errMessage(error),
      });
    }
  }

  if (ftpService.isFtpEnabled() && account.ftpUser) {
    try {
      await ftpService.deleteFtpUser(account.ftpUser);
    } catch (error) {
      logger.warn('Failed to delete FTP user during termination', {
        accountId,
        message: errMessage(error),
      });
    }
  }

  if (mysqlProvisionService.isMysqlEnabled() && account.dbUser) {
    try {
      await mysqlProvisionService.setAccountUserLocked(account.dbUser, true);
    } catch (error) {
      logger.warn('Failed to lock MySQL user during termination', {
        accountId,
        message: errMessage(error),
      });
    }
  }

  // (4) Move the docroot's parent directory into the trash dir; the
  //     retention job purges it after retentionDays.
  try {
    await moveToTrash(account);
  } catch (error) {
    logger.error('Failed to move document root to trash during termination', {
      accountId,
      documentRoot: account.documentRoot,
      message: errMessage(error),
    });
  }

  logger.info('Hosting account terminated', {
    accountId,
    reason: opts.reason,
    actorUserId: opts?.actorUserId,
  });

  return toAccountDTO(await loadAccount(account.id));
}
