import { prisma } from '../../src/config/database';
import {
  notifyAccountProvisioned,
  notifyAccountReactivated,
  notifyAccountSuspended,
  notifyPaymentFailed,
  notifyQuotaAlert,
  notifySslExpiring,
  notifySslFailed,
  notifySslIssued,
  notifySubscriptionCanceled,
} from '../../src/services/hostingNotificationService';

jest.mock('../../src/services/emailService', () => ({
  sendEmail: jest.fn(async () => ({ success: true, sent: true })),
}));

const emailService = require('../../src/services/emailService') as {
  sendEmail: jest.Mock;
};

const USER_EMAIL = 'wp07-notify@test.com';
const PLAN_NAME = 'wp07-notify-plan';
const ACCOUNT_DOMAIN = 'wp07-notify.sahary.cloud';
const CUSTOM_DOMAIN = 'wp07-site.example.com';

let userId = '';
let planId = '';
let accountId = '';
let domainId = '';

const seedAccount = async () => {
  const user = await prisma.user.create({
    data: {
      email: USER_EMAIL,
      password: 'hashed-placeholder',
      firstName: 'Notify',
      lastName: 'User',
      isVerified: true,
    },
  });
  userId = user.id;
  const plan = await prisma.hostingPlan.create({
    data: {
      name: PLAN_NAME,
      diskGB: 10,
      bandwidthGB: 50,
      maxDomains: 2,
      maxDatabases: 2,
      maxFtpAccounts: 1,
      monthlyPrice: 4.99,
    },
  });
  planId = plan.id;
  const account = await prisma.hostingAccount.create({
    data: {
      userId,
      planId,
      domain: ACCOUNT_DOMAIN,
      diskQuota: 10,
      bandwidthQuota: 50,
      diskUsed: 9.5,
      bandwidthUsed: 45,
      status: 'ACTIVE',
    },
  });
  accountId = account.id;
  const domain = await prisma.hostingDomain.create({
    data: { accountId, domain: CUSTOM_DOMAIN, isVerified: true },
  });
  domainId = domain.id;
};

const notificationsOf = () =>
  prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });

const parseMeta = (raw: string | null): Record<string, unknown> =>
  JSON.parse(raw ?? '{}') as Record<string, unknown>;

beforeAll(async () => {
  await (global as any).cleanupTestUsers(prisma, [USER_EMAIL]);
  await prisma.hostingPlan.deleteMany({ where: { name: PLAN_NAME } });
  await seedAccount();
});

afterAll(async () => {
  await (global as any).cleanupTestUsers(prisma, [USER_EMAIL]);
  await prisma.hostingPlan.deleteMany({ where: { name: PLAN_NAME } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  delete process.env.ENABLE_EMAIL_NOTIFICATIONS;
  // Tests in this file assert exact row counts — start each case clean.
  await prisma.notification.deleteMany({ where: { userId } });
});

describe('hostingNotificationService', () => {
  test('creates an in-app Notification row and sends the bilingual email', async () => {
    await notifyAccountProvisioned(accountId);

    const rows = await notificationsOf();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('SUCCESS');
    expect(rows[0].title.length).toBeGreaterThan(0);
    expect(parseMeta(rows[0].metadata)).toEqual({
      kind: 'ACCOUNT_PROVISIONED',
      accountId,
    });

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    const sent = emailService.sendEmail.mock.calls[0][0];
    expect(sent.to).toBe(USER_EMAIL);
    expect(sent.subject).toContain('ready');
    expect(sent.html).toContain('dir="rtl"');
    expect(sent.html).toContain(ACCOUNT_DOMAIN);
    expect(sent.text).toContain('/dashboard/hosting');
  });

  test('de-duplicates the same kind+target within the 6h window', async () => {
    await notifyAccountSuspended(accountId, 'ADMIN');
    await notifyAccountSuspended(accountId, 'ABUSE');

    const rows = await notificationsOf();
    expect(rows).toHaveLength(1);
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
  });

  test('a same-kind row older than 6h does not suppress a new notification', async () => {
    const stale = new Date(Date.now() - 7 * 60 * 60 * 1000);
    await prisma.notification.create({
      data: {
        userId,
        title: 'old',
        message: 'old suspend',
        type: 'WARNING',
        metadata: JSON.stringify({ kind: 'ACCOUNT_SUSPENDED', accountId }),
        createdAt: stale,
      },
    });

    await notifyAccountSuspended(accountId, 'ADMIN');

    const rows = await notificationsOf();
    expect(rows).toHaveLength(2);
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
  });

  test('quota alerts dedupe per resource+percent but not across levels', async () => {
    await notifyQuotaAlert(accountId, 'disk', 80);
    await notifyQuotaAlert(accountId, 'disk', 80); // dup — suppressed
    await notifyQuotaAlert(accountId, 'disk', 100); // new level — sent

    const rows = await notificationsOf();
    expect(rows).toHaveLength(2);
    expect(parseMeta(rows[0].metadata)).toMatchObject({ kind: 'QUOTA_ALERT', resource: 'disk', percent: 80 });
    expect(rows[0].type).toBe('WARNING');
    expect(parseMeta(rows[1].metadata)).toMatchObject({ kind: 'QUOTA_ALERT', resource: 'disk', percent: 100 });
    expect(rows[1].type).toBe('ERROR');
    expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
  });

  test('ENABLE_EMAIL_NOTIFICATIONS=false still records the row but skips email', async () => {
    process.env.ENABLE_EMAIL_NOTIFICATIONS = 'false';

    await notifyAccountReactivated(accountId);

    const rows = await notificationsOf();
    expect(rows).toHaveLength(1);
    expect(parseMeta(rows[0].metadata).kind).toBe('ACCOUNT_REACTIVATED');
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  test('email failure resolves and keeps the in-app notification', async () => {
    emailService.sendEmail.mockRejectedValueOnce(new Error('smtp down'));

    await expect(notifyPaymentFailed(accountId, { nextRetryAt: null })).resolves.toBeUndefined();

    const rows = await notificationsOf();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('ERROR');
    expect(parseMeta(rows[0].metadata).kind).toBe('PAYMENT_FAILED');
  });

  test('notification-row create failure still sends the email and resolves', async () => {
    const spy = jest
      .spyOn(prisma.notification, 'create')
      .mockRejectedValueOnce(new Error('db down'));

    await expect(notifySubscriptionCanceled(accountId, null)).resolves.toBeUndefined();
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('SSL notifications resolve the owner via the domain row', async () => {
    await notifySslIssued(domainId);
    await notifySslExpiring(domainId, 14);
    await notifySslExpiring(domainId, 7);
    await notifySslFailed(domainId, 'NXDOMAIN');

    const rows = await notificationsOf();
    expect(rows).toHaveLength(4);
    expect(parseMeta(rows[0].metadata)).toMatchObject({ kind: 'SSL_ISSUED', domainId });
    expect(rows[1].type).toBe('WARNING');
    expect(rows[3].type).toBe('ERROR');

    const failedCall = emailService.sendEmail.mock.calls[3][0];
    expect(failedCall.to).toBe(USER_EMAIL);
    expect(failedCall.text).toContain('NXDOMAIN');
    expect(failedCall.html).toContain(CUSTOM_DOMAIN);
  });

  test('unknown targets resolve quietly without rows or emails', async () => {
    await notifyAccountProvisioned('no-such-account');
    await notifySslIssued('no-such-domain');
    await notifyQuotaAlert(accountId, 'bandwidth', 80); // sanity: valid call still works

    const rows = await notificationsOf();
    expect(rows).toHaveLength(1);
    expect(parseMeta(rows[0].metadata)).toMatchObject({ kind: 'QUOTA_ALERT', resource: 'bandwidth' });
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
  });
});
