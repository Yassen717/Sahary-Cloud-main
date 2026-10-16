// Hosting notification service (P10 / CONTRACT section 8).
// Every function resolves and NEVER throws: the in-app Notification row and
// the email are best-effort side effects; callers (provisioning, metering,
// billing webhooks) must not fail because a notification did.

import { prisma } from '../config/database';
import logger from '../utils/logger';

// emailService is a legacy script-style module (module.exports = instance,
// no ES exports) — same require+annotation pattern as src/index.ts.
const emailService = require('./emailService') as {
  sendEmail(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ success: boolean; sent: boolean; error?: string; message?: string }>;
};
import {
  accountProvisionedEmail,
  accountReactivatedEmail,
  accountSuspendedEmail,
  paymentFailedEmail,
  quotaAlertEmail,
  sslExpiringEmail,
  sslFailedEmail,
  sslIssuedEmail,
  subscriptionCanceledEmail,
  type HostingEmailTemplate,
} from './hostingEmailTemplates';
import type { SuspendReason } from '../types/hosting';

const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000;

type NotificationType = 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';

const errMsg = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const frontendBase = (): string =>
  (process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/+$/, '');

const linkUrls = () => {
  const base = frontendBase();
  return {
    hosting: `${base}/dashboard/hosting`,
    files: `${base}/dashboard/hosting/files`,
    billing: `${base}/dashboard/subscription`,
  };
};

const siteUrl = (domain: string, sslEnabled: boolean): string =>
  `${sslEnabled ? 'https' : 'http'}://${domain}`;

const ACCOUNT_SELECT = {
  id: true,
  domain: true,
  sslEnabled: true,
  diskUsed: true,
  diskQuota: true,
  bandwidthUsed: true,
  bandwidthQuota: true,
  user: { select: { id: true, email: true, firstName: true } },
} as const;

const DOMAIN_SELECT = {
  id: true,
  domain: true,
  account: {
    select: {
      id: true,
      user: { select: { id: true, email: true, firstName: true } },
    },
  },
} as const;

async function alreadyNotified(userId: string, dedupe: Record<string, unknown>): Promise<boolean> {
  const kind = typeof dedupe.kind === 'string' ? dedupe.kind : '';
  try {
    const rows = await prisma.notification.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
        metadata: { contains: `"kind":"${kind}"` },
      },
      select: { metadata: true },
      take: 200,
    });
    return rows.some((row) => {
      try {
        const meta = JSON.parse(row.metadata ?? '{}') as Record<string, unknown>;
        return Object.entries(dedupe).every(([key, value]) => meta[key] === value);
      } catch {
        return false;
      }
    });
  } catch (error) {
    // A failed dedupe lookup must not silence a real notification.
    logger.warn('hosting notification dedupe check failed; continuing', {
      error: errMsg(error),
    });
    return false;
  }
}

async function dispatch(input: {
  userId: string;
  email: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  dedupe: Record<string, unknown>;
  emailContent?: HostingEmailTemplate;
}): Promise<void> {
  if (await alreadyNotified(input.userId, input.dedupe)) {
    return;
  }

  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type,
        metadata: JSON.stringify(input.metadata),
      },
    });
  } catch (error) {
    logger.error('failed to create hosting notification row', {
      kind: input.dedupe.kind,
      error: errMsg(error),
    });
  }

  if (!input.emailContent || process.env.ENABLE_EMAIL_NOTIFICATIONS === 'false') {
    return;
  }
  try {
    const result = await emailService.sendEmail({
      to: input.email,
      subject: input.emailContent.subject,
      text: input.emailContent.text,
      html: input.emailContent.html,
    });
    if (!result?.success) {
      logger.warn('hosting notification email was not sent', {
        kind: input.dedupe.kind,
        error: result?.error ?? 'unknown',
      });
    }
  } catch (error) {
    logger.error('hosting notification email send threw', {
      kind: input.dedupe.kind,
      error: errMsg(error),
    });
  }
}

export async function notifyAccountProvisioned(accountId: string): Promise<void> {
  try {
    const account = await prisma.hostingAccount.findUnique({
      where: { id: accountId },
      select: ACCOUNT_SELECT,
    });
    if (!account?.user) {
      logger.warn('notifyAccountProvisioned: account not found', { accountId });
      return;
    }
    const metadata = { kind: 'ACCOUNT_PROVISIONED', accountId };
    await dispatch({
      userId: account.user.id,
      email: account.user.email,
      type: 'SUCCESS',
      title: 'Hosting account ready',
      message: `Your hosting site ${account.domain} is ready.`,
      metadata,
      dedupe: metadata,
      emailContent: accountProvisionedEmail({
        name: account.user.firstName,
        domain: account.domain,
        siteUrl: siteUrl(account.domain, account.sslEnabled),
        dashboardUrl: linkUrls().hosting,
      }),
    });
  } catch (error) {
    logger.error('notifyAccountProvisioned failed', { error: errMsg(error) });
  }
}

export async function notifyAccountSuspended(accountId: string, reason: SuspendReason): Promise<void> {
  try {
    const account = await prisma.hostingAccount.findUnique({
      where: { id: accountId },
      select: ACCOUNT_SELECT,
    });
    if (!account?.user) {
      logger.warn('notifyAccountSuspended: account not found', { accountId });
      return;
    }
    const urls = linkUrls();
    await dispatch({
      userId: account.user.id,
      email: account.user.email,
      type: 'WARNING',
      title: 'Hosting account suspended',
      message: `Your hosting account for ${account.domain} was suspended (${reason}).`,
      metadata: { kind: 'ACCOUNT_SUSPENDED', accountId, reason },
      dedupe: { kind: 'ACCOUNT_SUSPENDED', accountId },
      emailContent: accountSuspendedEmail({
        name: account.user.firstName,
        domain: account.domain,
        reason,
        billingUrl: urls.billing,
        dashboardUrl: urls.hosting,
      }),
    });
  } catch (error) {
    logger.error('notifyAccountSuspended failed', { error: errMsg(error) });
  }
}

export async function notifyAccountReactivated(accountId: string): Promise<void> {
  try {
    const account = await prisma.hostingAccount.findUnique({
      where: { id: accountId },
      select: ACCOUNT_SELECT,
    });
    if (!account?.user) {
      logger.warn('notifyAccountReactivated: account not found', { accountId });
      return;
    }
    const metadata = { kind: 'ACCOUNT_REACTIVATED', accountId };
    await dispatch({
      userId: account.user.id,
      email: account.user.email,
      type: 'SUCCESS',
      title: 'Hosting account reactivated',
      message: `Your hosting account for ${account.domain} is active again.`,
      metadata,
      dedupe: metadata,
      emailContent: accountReactivatedEmail({
        name: account.user.firstName,
        domain: account.domain,
        dashboardUrl: linkUrls().hosting,
      }),
    });
  } catch (error) {
    logger.error('notifyAccountReactivated failed', { error: errMsg(error) });
  }
}

export async function notifyPaymentFailed(
  accountId: string,
  info: { nextRetryAt?: Date | null; hostedInvoiceUrl?: string | null },
): Promise<void> {
  try {
    const account = await prisma.hostingAccount.findUnique({
      where: { id: accountId },
      select: ACCOUNT_SELECT,
    });
    if (!account?.user) {
      logger.warn('notifyPaymentFailed: account not found', { accountId });
      return;
    }
    const metadata = { kind: 'PAYMENT_FAILED', accountId };
    await dispatch({
      userId: account.user.id,
      email: account.user.email,
      type: 'ERROR',
      title: 'Hosting payment failed',
      message: `We could not collect the subscription payment for ${account.domain}.`,
      metadata,
      dedupe: metadata,
      emailContent: paymentFailedEmail({
        name: account.user.firstName,
        domain: account.domain,
        nextRetryAt: info.nextRetryAt ?? null,
        hostedInvoiceUrl: info.hostedInvoiceUrl ?? null,
        billingUrl: linkUrls().billing,
      }),
    });
  } catch (error) {
    logger.error('notifyPaymentFailed failed', { error: errMsg(error) });
  }
}

export async function notifySubscriptionCanceled(accountId: string, endsAt: Date | null): Promise<void> {
  try {
    const account = await prisma.hostingAccount.findUnique({
      where: { id: accountId },
      select: ACCOUNT_SELECT,
    });
    if (!account?.user) {
      logger.warn('notifySubscriptionCanceled: account not found', { accountId });
      return;
    }
    const metadata = { kind: 'SUBSCRIPTION_CANCELED', accountId };
    await dispatch({
      userId: account.user.id,
      email: account.user.email,
      type: 'WARNING',
      title: 'Hosting subscription canceled',
      message: endsAt
        ? `Your hosting subscription for ${account.domain} was canceled; the site stays active until ${endsAt.toISOString().slice(0, 10)}.`
        : `Your hosting subscription for ${account.domain} was canceled.`,
      metadata,
      dedupe: metadata,
      emailContent: subscriptionCanceledEmail({
        name: account.user.firstName,
        domain: account.domain,
        endsAt,
        billingUrl: linkUrls().billing,
      }),
    });
  } catch (error) {
    logger.error('notifySubscriptionCanceled failed', { error: errMsg(error) });
  }
}

export async function notifyQuotaAlert(
  accountId: string,
  resource: 'disk' | 'bandwidth',
  percent: 80 | 100,
): Promise<void> {
  try {
    const account = await prisma.hostingAccount.findUnique({
      where: { id: accountId },
      select: ACCOUNT_SELECT,
    });
    if (!account?.user) {
      logger.warn('notifyQuotaAlert: account not found', { accountId });
      return;
    }
    const urls = linkUrls();
    const usedGB = resource === 'disk' ? account.diskUsed : account.bandwidthUsed;
    const quotaGB = resource === 'disk' ? account.diskQuota : account.bandwidthQuota;
    const metadata = { kind: 'QUOTA_ALERT', accountId, resource, percent };
    await dispatch({
      userId: account.user.id,
      email: account.user.email,
      type: percent >= 100 ? 'ERROR' : 'WARNING',
      title: `${resource === 'disk' ? 'Disk' : 'Bandwidth'} usage at ${percent}%`,
      message: `${resource === 'disk' ? 'Disk' : 'Bandwidth'} usage for ${account.domain} reached ${percent}%.`,
      metadata,
      dedupe: metadata,
      emailContent: quotaAlertEmail({
        name: account.user.firstName,
        domain: account.domain,
        resource,
        percent,
        usedGB,
        quotaGB,
        filesUrl: urls.files,
        billingUrl: urls.billing,
      }),
    });
  } catch (error) {
    logger.error('notifyQuotaAlert failed', { error: errMsg(error) });
  }
}

export async function notifySslIssued(domainId: string): Promise<void> {
  try {
    const domain = await prisma.hostingDomain.findUnique({
      where: { id: domainId },
      select: DOMAIN_SELECT,
    });
    if (!domain?.account?.user) {
      logger.warn('notifySslIssued: domain not found', { domainId });
      return;
    }
    const metadata = { kind: 'SSL_ISSUED', domainId };
    await dispatch({
      userId: domain.account.user.id,
      email: domain.account.user.email,
      type: 'SUCCESS',
      title: 'SSL certificate issued',
      message: `HTTPS is now active for ${domain.domain}.`,
      metadata,
      dedupe: metadata,
      emailContent: sslIssuedEmail({
        name: domain.account.user.firstName,
        domain: domain.domain,
        siteUrl: `https://${domain.domain}`,
      }),
    });
  } catch (error) {
    logger.error('notifySslIssued failed', { error: errMsg(error) });
  }
}

export async function notifySslExpiring(domainId: string, daysLeft: number): Promise<void> {
  try {
    const domain = await prisma.hostingDomain.findUnique({
      where: { id: domainId },
      select: DOMAIN_SELECT,
    });
    if (!domain?.account?.user) {
      logger.warn('notifySslExpiring: domain not found', { domainId });
      return;
    }
    const metadata = { kind: 'SSL_EXPIRING', domainId, daysLeft };
    await dispatch({
      userId: domain.account.user.id,
      email: domain.account.user.email,
      type: 'WARNING',
      title: 'SSL certificate expiring soon',
      message: `The SSL certificate for ${domain.domain} expires in ${daysLeft} days.`,
      metadata,
      dedupe: metadata,
      emailContent: sslExpiringEmail({
        name: domain.account.user.firstName,
        domain: domain.domain,
        daysLeft,
        dashboardUrl: linkUrls().hosting,
      }),
    });
  } catch (error) {
    logger.error('notifySslExpiring failed', { error: errMsg(error) });
  }
}

export async function notifySslFailed(domainId: string, message: string): Promise<void> {
  try {
    const domain = await prisma.hostingDomain.findUnique({
      where: { id: domainId },
      select: DOMAIN_SELECT,
    });
    if (!domain?.account?.user) {
      logger.warn('notifySslFailed: domain not found', { domainId });
      return;
    }
    const metadata = { kind: 'SSL_FAILED', domainId };
    await dispatch({
      userId: domain.account.user.id,
      email: domain.account.user.email,
      type: 'ERROR',
      title: 'SSL certificate issuance failed',
      message: `Could not issue or renew the SSL certificate for ${domain.domain}.`,
      metadata,
      dedupe: metadata,
      emailContent: sslFailedEmail({
        name: domain.account.user.firstName,
        domain: domain.domain,
        reason: message,
        dashboardUrl: linkUrls().hosting,
      }),
    });
  } catch (error) {
    logger.error('notifySslFailed failed', { error: errMsg(error) });
  }
}
