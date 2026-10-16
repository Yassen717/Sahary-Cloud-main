// Admin hosting queries + actions (CONTRACT section 7, admin rows).
// Read paths return hostingDto mappers; actions delegate state changes to
// hostingLifecycleService (WP02) and record an AuditLog row per contract.

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import { httpError } from '../utils/httpError';
import {
  toAdminAccountDTO,
  toDatabaseDTO,
  toDomainDTO,
  toPlanDTO,
} from './hostingDto';
import {
  activateAccount,
  retryProvisioning,
  suspendAccount,
  terminateAccountById,
} from './hostingLifecycleService';
import { syncPlanToStripe } from './stripeBillingService';
import type {
  AdminHostingAccountDTO,
  AdminHostingAccountDetailDTO,
  AdminHostingPlanDTO,
  AdminHostingStatsDTO,
  HostingAccountStatus,
  Paginated,
} from '../types/hosting';

export const HOSTING_ACCOUNT_STATUSES: readonly HostingAccountStatus[] = [
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'PROVISION_FAILED',
  'TERMINATED',
];

export interface AdminListQuery {
  status?: HostingAccountStatus;
  search?: string;
  page: number;
  limit: number;
}

export interface AdminActor {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const ADMIN_ACCOUNT_INCLUDE = {
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  plan: true,
  _count: { select: { domains: true, databases: true } },
} as const;

export async function listAccounts(
  query: AdminListQuery,
): Promise<Paginated<AdminHostingAccountDTO>> {
  const where: Prisma.HostingAccountWhereInput = {};
  if (query.status) {
    where.status = query.status;
  }
  const search = query.search?.trim();
  if (search) {
    const contains = { contains: search, mode: 'insensitive' as const };
    where.OR = [
      { domain: contains },
      { user: { email: contains } },
      { user: { firstName: contains } },
      { user: { lastName: contains } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.hostingAccount.count({ where }),
    prisma.hostingAccount.findMany({
      where,
      include: ADMIN_ACCOUNT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(toAdminAccountDTO),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getAccountDetail(id: string): Promise<AdminHostingAccountDetailDTO> {
  const account = await prisma.hostingAccount.findUnique({
    where: { id },
    include: {
      ...ADMIN_ACCOUNT_INCLUDE,
      domains: { orderBy: { createdAt: 'asc' } },
      databases: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!account) {
    throw httpError(404, 'Hosting account not found');
  }
  return {
    ...toAdminAccountDTO(account),
    domains: account.domains.map(toDomainDTO),
    databases: account.databases.map(toDatabaseDTO),
    ftpUser: account.ftpUser,
  };
}

async function audit(
  actor: AdminActor,
  entry: {
    action: string;
    resource: string;
    resourceId: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: actor.actorUserId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        oldValues: entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        newValues: entry.newValues ? JSON.stringify(entry.newValues) : null,
      },
    });
  } catch (error) {
    // The state change already succeeded — losing the audit row must not turn
    // a completed admin action into a 500, but it must be loud in logs.
    logger.error('failed to write hosting admin audit log', {
      action: entry.action,
      resourceId: entry.resourceId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function mutateAccount(
  id: string,
  opts: {
    allowedFrom: readonly string[];
    verb: string;
    action: string;
    actor: AdminActor;
    newValues?: Record<string, unknown>;
    run: () => Promise<unknown>;
  },
): Promise<AdminHostingAccountDetailDTO> {
  const before = await prisma.hostingAccount.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!before) {
    throw httpError(404, 'Hosting account not found');
  }
  if (!opts.allowedFrom.includes(before.status)) {
    throw httpError(
      409,
      `Cannot ${opts.verb} a hosting account in status ${before.status}`,
    );
  }

  await opts.run();

  await audit(opts.actor, {
    action: opts.action,
    resource: 'hosting_account',
    resourceId: id,
    oldValues: { status: before.status },
    newValues: opts.newValues,
  });

  return getAccountDetail(id);
}

export function suspendAccountById(
  id: string,
  actor: AdminActor,
  note?: string,
): Promise<AdminHostingAccountDetailDTO> {
  return mutateAccount(id, {
    allowedFrom: ['ACTIVE'],
    verb: 'suspend',
    action: 'HOSTING_ACCOUNT_SUSPEND',
    actor,
    newValues: { reason: 'ADMIN', note: note ?? null },
    run: () => suspendAccount(id, 'ADMIN', { actorUserId: actor.actorUserId, note }),
  });
}

export function activateAccountById(
  id: string,
  actor: AdminActor,
): Promise<AdminHostingAccountDetailDTO> {
  return mutateAccount(id, {
    allowedFrom: ['SUSPENDED'],
    verb: 'activate',
    action: 'HOSTING_ACCOUNT_ACTIVATE',
    actor,
    run: () => activateAccount(id, { actorUserId: actor.actorUserId }),
  });
}

export function retryAccountProvisioning(
  id: string,
  actor: AdminActor,
): Promise<AdminHostingAccountDetailDTO> {
  return mutateAccount(id, {
    allowedFrom: ['PROVISION_FAILED'],
    verb: 'retry provisioning for',
    action: 'HOSTING_ACCOUNT_RETRY_PROVISIONING',
    actor,
    run: () => retryProvisioning(id, { actorUserId: actor.actorUserId }),
  });
}

export function terminateAccountByIdAdmin(
  id: string,
  actor: AdminActor,
): Promise<AdminHostingAccountDetailDTO> {
  return mutateAccount(id, {
    allowedFrom: ['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'PROVISION_FAILED'],
    verb: 'terminate',
    action: 'HOSTING_ACCOUNT_TERMINATE',
    actor,
    newValues: { reason: 'ADMIN' },
    run: () =>
      terminateAccountById(id, { actorUserId: actor.actorUserId, reason: 'ADMIN' }),
  });
}

const MRR_STATUSES = ['active', 'trialing', 'past_due'] as const;

export async function getStats(): Promise<AdminHostingStatsDTO> {
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [
    byStatus,
    usageAgg,
    payingAccounts,
    sslActive,
    sslExpiring,
    sslFailed,
    plans,
    accountsByPlan,
  ] = await Promise.all([
    prisma.hostingAccount.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.hostingAccount.aggregate({
      where: { status: { not: 'TERMINATED' } },
      _sum: {
        diskUsed: true,
        diskQuota: true,
        bandwidthUsed: true,
        bandwidthQuota: true,
      },
    }),
    prisma.hostingAccount.findMany({
      where: {
        status: 'ACTIVE',
        subscriptionStatus: { in: [...MRR_STATUSES] },
      },
      select: { plan: { select: { monthlyPrice: true } } },
    }),
    prisma.hostingDomain.count({ where: { sslStatus: 'ACTIVE' } }),
    prisma.hostingDomain.count({
      where: {
        sslStatus: 'ACTIVE',
        sslExpiresAt: { gt: now, lte: in14Days },
      },
    }),
    prisma.hostingDomain.count({ where: { sslStatus: 'FAILED' } }),
    prisma.hostingPlan.findMany({
      select: { id: true, name: true },
      orderBy: { monthlyPrice: 'asc' },
    }),
    prisma.hostingAccount.groupBy({
      by: ['planId'],
      where: { status: { not: 'TERMINATED' } },
      _count: { _all: true },
    }),
  ]);

  const statusCount = new Map(byStatus.map((row) => [row.status, row._count._all]));
  const statusOf = (s: HostingAccountStatus): number => statusCount.get(s) ?? 0;

  const mrrRaw = payingAccounts.reduce(
    (sum, account) => sum + Number(account.plan.monthlyPrice),
    0,
  );

  const planCount = new Map(accountsByPlan.map((row) => [row.planId, row._count._all]));

  return {
    accounts: {
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      active: statusOf('ACTIVE'),
      suspended: statusOf('SUSPENDED'),
      provisioning: statusOf('PROVISIONING'),
      failed: statusOf('PROVISION_FAILED'),
      terminated: statusOf('TERMINATED'),
    },
    mrr: Math.round(mrrRaw * 100) / 100,
    usage: {
      diskUsedGB: usageAgg._sum.diskUsed ?? 0,
      diskQuotaGB: usageAgg._sum.diskQuota ?? 0,
      bandwidthUsedGB: usageAgg._sum.bandwidthUsed ?? 0,
      bandwidthQuotaGB: usageAgg._sum.bandwidthQuota ?? 0,
    },
    ssl: {
      active: sslActive,
      expiringWithin14Days: sslExpiring,
      failed: sslFailed,
    },
    plans: plans.map((plan) => ({
      planId: plan.id,
      name: plan.name,
      accounts: planCount.get(plan.id) ?? 0,
    })),
  };
}

export async function listPlans(): Promise<AdminHostingPlanDTO[]> {
  const [plans, accountsByPlan] = await Promise.all([
    prisma.hostingPlan.findMany({ orderBy: { monthlyPrice: 'asc' } }),
    prisma.hostingAccount.groupBy({
      by: ['planId'],
      where: { status: { not: 'TERMINATED' } },
      _count: { _all: true },
    }),
  ]);
  const planCount = new Map(accountsByPlan.map((row) => [row.planId, row._count._all]));
  return plans.map((plan) => ({
    ...toPlanDTO(plan),
    stripeProductId: plan.stripeProductId,
    stripePriceId: plan.stripePriceId,
    accountCount: planCount.get(plan.id) ?? 0,
  }));
}

export interface UpdatePlanPatch {
  description?: string | null;
  monthlyPrice?: number;
  diskGB?: number;
  bandwidthGB?: number;
  maxDomains?: number;
  maxDatabases?: number;
  maxFtpAccounts?: number;
  isActive?: boolean;
}

const isStripeConfigured = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY);

export async function updatePlan(
  id: string,
  patch: UpdatePlanPatch,
  actor: AdminActor,
): Promise<AdminHostingPlanDTO> {
  const plan = await prisma.hostingPlan.findUnique({ where: { id } });
  if (!plan) {
    throw httpError(404, 'Hosting plan not found');
  }

  const priceChanged =
    patch.monthlyPrice !== undefined &&
    !new Prisma.Decimal(patch.monthlyPrice).equals(plan.monthlyPrice);

  let stripeIds: { stripeProductId: string; stripePriceId: string } | null = null;
  if (priceChanged && plan.stripePriceId && isStripeConfigured()) {
    // Stripe prices are immutable: syncPlanToStripe creates a NEW price on
    // Stripe and returns its ids. If it throws (upstream failure -> 502),
    // nothing below runs and the plan keeps its old price and Stripe ids.
    // Existing subscribers keep their old price regardless — a new Stripe
    // price only affects future checkouts.
    stripeIds = await syncPlanToStripe(plan.id);
  }

  const data: Prisma.HostingPlanUpdateInput = {};
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.monthlyPrice !== undefined) data.monthlyPrice = patch.monthlyPrice;
  if (patch.diskGB !== undefined) data.diskGB = patch.diskGB;
  if (patch.bandwidthGB !== undefined) data.bandwidthGB = patch.bandwidthGB;
  if (patch.maxDomains !== undefined) data.maxDomains = patch.maxDomains;
  if (patch.maxDatabases !== undefined) data.maxDatabases = patch.maxDatabases;
  if (patch.maxFtpAccounts !== undefined) data.maxFtpAccounts = patch.maxFtpAccounts;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (stripeIds) {
    data.stripeProductId = stripeIds.stripeProductId;
    data.stripePriceId = stripeIds.stripePriceId;
  }

  const updated = await prisma.hostingPlan.update({ where: { id }, data });

  await audit(actor, {
    action: 'HOSTING_PLAN_UPDATE',
    resource: 'hosting_plan',
    resourceId: id,
    oldValues: {
      description: plan.description,
      monthlyPrice: Number(plan.monthlyPrice),
      diskGB: plan.diskGB,
      bandwidthGB: plan.bandwidthGB,
      maxDomains: plan.maxDomains,
      maxDatabases: plan.maxDatabases,
      maxFtpAccounts: plan.maxFtpAccounts,
      isActive: plan.isActive,
    },
    newValues: patch as Record<string, unknown>,
  });

  const accountCount = await prisma.hostingAccount.count({
    where: { planId: id, status: { not: 'TERMINATED' } },
  });

  // Deactivating a plan only removes it from the public listing; existing
  // accounts keep running on their current quotas and Stripe subscription.
  return {
    ...toPlanDTO(updated),
    stripeProductId: updated.stripeProductId,
    stripePriceId: updated.stripePriceId,
    accountCount,
  };
}
