import type { HostingAccount, HostingDatabase, HostingDomain, HostingPlan, User } from '@prisma/client';
import type {
  AdminHostingAccountDTO,
  HostingAccountDTO,
  HostingAccountStatus,
  HostingDatabaseDTO,
  HostingDomainDTO,
  HostingPlanDTO,
  HostingSubscriptionSummary,
  HostingUsageSummary,
  SslStatus,
  SuspendReason,
  UsageLevel,
} from '../types/hosting';

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const asStatus = (value: string): HostingAccountStatus => value as HostingAccountStatus;
const asReason = (value: string | null): SuspendReason | null => (value as SuspendReason | null) ?? null;
const asSslStatus = (value: string | null): SslStatus => ((value as SslStatus | null) ?? 'NONE') as SslStatus;

export function usageLevel(used: number, quota: number): UsageLevel {
  if (quota <= 0) {
    return 'OK';
  }
  const ratio = used / quota;
  if (ratio >= 1) {
    return 'EXCEEDED';
  }
  if (ratio >= 0.8) {
    return 'WARNING';
  }
  return 'OK';
}

export function toPlanDTO(plan: HostingPlan): HostingPlanDTO {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    diskGB: plan.diskGB,
    bandwidthGB: plan.bandwidthGB,
    maxDomains: plan.maxDomains,
    maxDatabases: plan.maxDatabases,
    maxFtpAccounts: plan.maxFtpAccounts,
    monthlyPrice: Number(plan.monthlyPrice),
    currency: 'USD',
    isActive: plan.isActive,
    purchasable: Boolean(plan.stripePriceId),
  };
}

export function toDomainDTO(domain: HostingDomain): HostingDomainDTO {
  const enabled = domain.sslEnabled || domain.sslStatus === 'ACTIVE';
  const unverifiedToken = !domain.isVerified && domain.verifyToken ? domain.verifyToken : null;

  return {
    id: domain.id,
    domain: domain.domain,
    isVerified: domain.isVerified,
    verification: unverifiedToken
      ? { recordType: 'TXT', host: domain.domain, value: `sahary-verify=${unverifiedToken}` }
      : null,
    verifyToken: unverifiedToken,
    sslEnabled: enabled,
    ssl: {
      status: asSslStatus(domain.sslStatus),
      enabled,
      issuedAt: iso(domain.sslIssuedAt),
      expiresAt: iso(domain.sslExpiresAt),
      lastError: domain.sslLastError,
    },
    createdAt: domain.createdAt.toISOString(),
  };
}

const nextUtcMonthStart = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

export function toUsageSummary(account: HostingAccount): HostingUsageSummary {
  const cycleStart = account.bandwidthCycleStart;
  return {
    diskUsedGB: account.diskUsed,
    diskQuotaGB: account.diskQuota,
    diskLevel: usageLevel(account.diskUsed, account.diskQuota),
    bandwidthUsedGB: account.bandwidthUsed,
    bandwidthQuotaGB: account.bandwidthQuota,
    bandwidthLevel: usageLevel(account.bandwidthUsed, account.bandwidthQuota),
    bandwidthCycleStart: iso(cycleStart),
    bandwidthCycleEnd: cycleStart ? iso(nextUtcMonthStart(cycleStart)) : null,
    updatedAt: iso(account.usageUpdatedAt),
  };
}

const toSubscription = (account: HostingAccount): HostingSubscriptionSummary | null => {
  if (account.stripeSubscriptionId === null && account.subscriptionStatus === null) {
    return null;
  }
  return {
    status: account.subscriptionStatus,
    currentPeriodEnd: iso(account.currentPeriodEnd),
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
  };
};

type AccountForDto = HostingAccount & {
  plan: HostingPlan;
  domains?: HostingDomain[];
};

export function toAccountDTO(account: AccountForDto): HostingAccountDTO {
  const { sslEnabled } = account;
  return {
    id: account.id,
    domain: account.domain,
    url: `${sslEnabled ? 'https' : 'http'}://${account.domain}`,
    status: asStatus(account.status),
    suspendReason: asReason(account.suspendReason),
    plan: toPlanDTO(account.plan),
    usage: toUsageSummary(account),
    ssl: { enabled: sslEnabled, expiresAt: iso(account.sslExpiresAt) },
    subscription: toSubscription(account),
    domains: (account.domains ?? []).map(toDomainDTO),
    ftpUser: account.ftpUser,
    createdAt: account.createdAt.toISOString(),
  };
}

type AdminAccountRow = HostingAccount & {
  plan: HostingPlan;
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
  domains?: HostingDomain[];
  databases?: HostingDatabase[];
  _count?: { domains?: number; databases?: number };
};

export function toAdminAccountDTO(account: AdminAccountRow): AdminHostingAccountDTO {
  return {
    id: account.id,
    domain: account.domain,
    status: asStatus(account.status),
    suspendReason: asReason(account.suspendReason),
    provisioningError: account.provisioningError,
    owner: {
      id: account.user.id,
      email: account.user.email,
      firstName: account.user.firstName,
      lastName: account.user.lastName,
    },
    plan: { id: account.plan.id, name: account.plan.name },
    usage: toUsageSummary(account),
    subscription: toSubscription(account),
    domainCount: account._count?.domains ?? account.domains?.length ?? 0,
    databaseCount: account._count?.databases ?? account.databases?.length ?? 0,
    createdAt: account.createdAt.toISOString(),
    suspendedAt: iso(account.suspendedAt),
    terminatedAt: iso(account.terminatedAt),
  };
}

export function toDatabaseDTO(db: HostingDatabase): HostingDatabaseDTO {
  return {
    id: db.id,
    name: db.name,
    isPrimary: db.isPrimary,
    createdAt: db.createdAt.toISOString(),
  };
}
