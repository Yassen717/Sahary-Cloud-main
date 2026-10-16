'use client';

import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CreditCard,
  Gauge,
  LifeBuoy,
  Loader2,
} from 'lucide-react';
import type { HostingAccountDTO } from '@/lib/hosting-types';

const SUPPORT_EMAIL = 'support@saharycloud.com';

/**
 * Explains the current account state and offers the right next step.
 * Renders nothing for ACTIVE accounts (and TERMINATED, which
 * `getMyAccount` never returns).
 */
export function AccountStatusAlert({ account }: { account: HostingAccountDTO }) {
  if (account.status === 'ACTIVE' || account.status === 'TERMINATED') {
    return null;
  }

  if (account.status === 'PROVISIONING') {
    return (
      <Alert>
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle>Setting up your hosting</AlertTitle>
        <AlertDescription>
          We&apos;re creating your website space, database and FTP access. This
          usually takes less than a minute — the page refreshes automatically.
        </AlertDescription>
      </Alert>
    );
  }

  if (account.status === 'PROVISION_FAILED') {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Setup didn&apos;t finish</AlertTitle>
        <AlertDescription>
          Something went wrong while setting up your hosting account. Our team
          has been notified and will retry automatically — you don&apos;t need
          to do anything. If it stays broken, contact{' '}
          <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </AlertDescription>
      </Alert>
    );
  }

  // SUSPENDED — pick the message and CTA from the suspend reason.
  if (account.suspendReason === 'PAYMENT_FAILED') {
    return (
      <Alert variant="destructive">
        <CreditCard className="h-4 w-4" />
        <AlertTitle>Payment failed — hosting suspended</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            We couldn&apos;t collect your latest subscription payment, so your
            site is offline. Update your payment method to bring it back.
          </p>
          <Button asChild size="sm">
            <Link href="/dashboard/subscription">Update payment</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (account.suspendReason === 'BANDWIDTH_EXCEEDED') {
    return (
      <Alert variant="destructive">
        <Gauge className="h-4 w-4" />
        <AlertTitle>Monthly bandwidth used up</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            Your site used its full bandwidth quota for this cycle, so it is
            offline until the cycle resets. Upgrade your plan for more
            bandwidth.
          </p>
          <Button asChild size="sm">
            <Link href="/dashboard/subscription">Upgrade plan</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <LifeBuoy className="h-4 w-4" />
      <AlertTitle>Hosting suspended</AlertTitle>
      <AlertDescription>
        {account.suspendReason === 'SUBSCRIPTION_CANCELED'
          ? 'Your subscription was canceled, so your site is offline. '
          : 'Your hosting account is suspended. '}
        Please contact{' '}
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>{' '}
        for help.
      </AlertDescription>
    </Alert>
  );
}

