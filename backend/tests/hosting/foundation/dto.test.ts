import type { HostingAccount, HostingDatabase, HostingDomain, HostingPlan } from '@prisma/client';
import {
  toAccountDTO,
  toAdminAccountDTO,
  toDatabaseDTO,
  toDomainDTO,
  toPlanDTO,
  toUsageSummary,
  usageLevel,
} from '../../../src/services/hostingDto';

const plan = (overrides: Partial<HostingPlan> = {}): HostingPlan => ({
  id: 'plan1',
  name: 'Starter',
  description: 'desc',
  diskGB: 10,
  bandwidthGB: 100,
  maxDomains: 2,
  maxDatabases: 3,
  maxFtpAccounts: 1,
  monthlyPrice: 9.99 as unknown as HostingPlan['monthlyPrice'],
  stripeProductId: 'prod_1',
  stripePriceId: 'price_1',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  ...overrides,
});

const account = (overrides: Partial<HostingAccount> = {}): HostingAccount => ({
  id: 'acct1',
  domain: 'alice.sahary.cloud',
  documentRoot: '/var/www/acct1/public_html',
  diskQuota: 10,
  bandwidthQuota: 100,
  diskUsed: 8.5,
  bandwidthUsed: 90,
  status: 'ACTIVE',
  ftpUser: 'sc_ftp1',
  ftpPassword: 'hash',
  dbName: 'sc_main',
  dbUser: 'sc_user',
  dbPassword: 'hash',
  sslEnabled: true,
  sslExpiresAt: new Date('2027-01-01T00:00:00Z'),
  provisioningError: null,
  suspendedAt: null,
  suspendReason: null,
  purgedAt: null,
  stripeSubscriptionId: 'sub_1',
  subscriptionStatus: 'active',
  currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
  cancelAtPeriodEnd: false,
  bandwidthCycleStart: new Date('2026-10-15T12:00:00Z'),
  usageUpdatedAt: new Date('2026-10-14T00:00:00Z'),
  bandwidthLogOffset: BigInt(0),
  bandwidthLogInode: null,
  diskAlertLevel: 0,
  bandwidthAlertLevel: 80,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-10-14T00:00:00Z'),
  terminatedAt: null,
  userId: 'user1',
  planId: 'plan1',
  ...overrides,
});

const domain = (overrides: Partial<HostingDomain> = {}): HostingDomain => ({
  id: 'dom1',
  domain: 'blog.example.com',
  isVerified: false,
  verifyToken: 'tok123',
  sslEnabled: false,
  sslIssuedAt: null,
  sslExpiresAt: null,
  sslStatus: 'PENDING',
  sslLastError: 'boom',
  sslLastAttemptAt: new Date('2026-10-01T00:00:00Z'),
  sslExpiryNoticeLevel: 0,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  accountId: 'acct1',
  ...overrides,
});

describe('hostingDto', () => {
  describe('usageLevel', () => {
    test('maps ratios to levels and quota 0 to OK', () => {
      expect(usageLevel(0, 0)).toBe('OK');
      expect(usageLevel(5, 0)).toBe('OK');
      expect(usageLevel(50, 100)).toBe('OK');
      expect(usageLevel(79.9, 100)).toBe('OK');
      expect(usageLevel(80, 100)).toBe('WARNING');
      expect(usageLevel(99.9, 100)).toBe('WARNING');
      expect(usageLevel(100, 100)).toBe('EXCEEDED');
      expect(usageLevel(150, 100)).toBe('EXCEEDED');
    });
  });

  describe('toPlanDTO', () => {
    test('maps fields, money to number, purchasable from stripePriceId', () => {
      const dto = toPlanDTO(plan());
      expect(dto.monthlyPrice).toBe(9.99);
      expect(dto.currency).toBe('USD');
      expect(dto.purchasable).toBe(true);
      expect(dto).not.toHaveProperty('stripeProductId');
      expect(dto).not.toHaveProperty('stripePriceId');
      expect(toPlanDTO(plan({ stripePriceId: null })).purchasable).toBe(false);
    });
  });

  describe('toDomainDTO', () => {
    test('unverified domain exposes TXT verification record and token', () => {
      const dto = toDomainDTO(domain());
      expect(dto.verification).toEqual({
        recordType: 'TXT',
        host: 'blog.example.com',
        value: 'sahary-verify=tok123',
      });
      expect(dto.verifyToken).toBe('tok123');
      expect(dto.ssl).toEqual({
        status: 'PENDING',
        enabled: false,
        issuedAt: null,
        expiresAt: null,
        lastError: 'boom',
      });
      expect(dto.sslEnabled).toBe(false);
    });

    test('verified domain clears verification payload', () => {
      const dto = toDomainDTO(domain({ isVerified: true }));
      expect(dto.verification).toBeNull();
      expect(dto.verifyToken).toBeNull();
    });

    test('unverified domain without token has null verification', () => {
      const dto = toDomainDTO(domain({ verifyToken: null }));
      expect(dto.verification).toBeNull();
    });

    test('sslStatus ACTIVE enables ssl even when legacy flag is off', () => {
      const dto = toDomainDTO(domain({ sslStatus: 'ACTIVE', sslEnabled: false }));
      expect(dto.ssl.enabled).toBe(true);
      expect(dto.sslEnabled).toBe(true);
    });
  });

  describe('toUsageSummary', () => {
    test('maps usage, levels and cycle end as next UTC month start', () => {
      const u = toUsageSummary(account());
      expect(u.diskUsedGB).toBe(8.5);
      expect(u.diskQuotaGB).toBe(10);
      expect(u.diskLevel).toBe('WARNING');
      expect(u.bandwidthUsedGB).toBe(90);
      expect(u.bandwidthQuotaGB).toBe(100);
      expect(u.bandwidthLevel).toBe('WARNING');
      expect(u.bandwidthCycleStart).toBe('2026-10-15T12:00:00.000Z');
      expect(u.bandwidthCycleEnd).toBe('2026-11-01T00:00:00.000Z');
      expect(u.updatedAt).toBe('2026-10-14T00:00:00.000Z');
    });

    test('null cycle start yields null cycle end', () => {
      const u = toUsageSummary(account({ bandwidthCycleStart: null }));
      expect(u.bandwidthCycleStart).toBeNull();
      expect(u.bandwidthCycleEnd).toBeNull();
    });

    test('December cycles roll into January of next year', () => {
      const u = toUsageSummary(account({ bandwidthCycleStart: new Date('2026-12-20T00:00:00Z') }));
      expect(u.bandwidthCycleEnd).toBe('2027-01-01T00:00:00.000Z');
    });
  });

  describe('toAccountDTO', () => {
    test('maps account envelope without secrets', () => {
      const dto = toAccountDTO({ ...account(), plan: plan(), domains: [domain()] } as HostingAccount & {
        plan: HostingPlan; domains: HostingDomain[];
      });
      expect(dto.url).toBe('https://alice.sahary.cloud');
      expect(dto.status).toBe('ACTIVE');
      expect(dto.plan.name).toBe('Starter');
      expect(dto.subscription).toEqual({
        status: 'active',
        currentPeriodEnd: '2026-11-01T00:00:00.000Z',
        cancelAtPeriodEnd: false,
      });
      expect(dto.domains).toHaveLength(1);
      expect(dto.ftpUser).toBe('sc_ftp1');
      expect(dto).not.toHaveProperty('ftpPassword');
      expect(dto).not.toHaveProperty('dbPassword');
      expect(dto).not.toHaveProperty('documentRoot');
      expect(dto).not.toHaveProperty('stripeSubscriptionId');
      expect(dto).not.toHaveProperty('provisioningError');
    });

    test('http url when ssl disabled', () => {
      const dto = toAccountDTO({ ...account({ sslEnabled: false }), plan: plan() } as HostingAccount & {
        plan: HostingPlan;
      });
      expect(dto.url).toBe('http://alice.sahary.cloud');
    });

    test('subscription is null only when both ids are null', () => {
      const bare = { ...account({ stripeSubscriptionId: null, subscriptionStatus: null }), plan: plan() } as HostingAccount & { plan: HostingPlan };
      expect(toAccountDTO(bare).subscription).toBeNull();
      const half = { ...account({ stripeSubscriptionId: null }), plan: plan() } as HostingAccount & { plan: HostingPlan };
      expect(toAccountDTO(half).subscription?.status).toBe('active');
    });
  });

  describe('toAdminAccountDTO', () => {
    test('includes owner, counts and provisioningError', () => {
      const row = {
        ...account({ provisioningError: 'boom' }),
        plan: plan(),
        user: { id: 'user1', email: 'a@b.c', firstName: 'A', lastName: 'B' },
        domains: [domain()],
        databases: [] as HostingDatabase[],
      } as Parameters<typeof toAdminAccountDTO>[0];
      const dto = toAdminAccountDTO(row);
      expect(dto.provisioningError).toBe('boom');
      expect(dto.owner.email).toBe('a@b.c');
      expect(dto.plan).toEqual({ id: 'plan1', name: 'Starter' });
      expect(dto.domainCount).toBe(1);
      expect(dto.databaseCount).toBe(0);
      expect(dto.suspendedAt).toBeNull();
    });
  });

  describe('toDatabaseDTO', () => {
    test('maps database row', () => {
      const db: HostingDatabase = {
        id: 'db1',
        name: 'sc_main',
        isPrimary: true,
        createdAt: new Date('2026-10-01T00:00:00Z'),
        accountId: 'acct1',
      };
      expect(toDatabaseDTO(db)).toEqual({
        id: 'db1',
        name: 'sc_main',
        isPrimary: true,
        createdAt: '2026-10-01T00:00:00.000Z',
      });
    });
  });
});
