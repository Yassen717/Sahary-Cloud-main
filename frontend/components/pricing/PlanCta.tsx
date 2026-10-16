'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import type { HostingAccountDTO, HostingPlanDTO } from '@/lib/hosting-types';

interface PlanCtaProps {
  plan: HostingPlanDTO;
  /** The caller's live hosting account, if any (null = none loaded). */
  account: HostingAccountDTO | null;
  /** True while the account lookup is still running for a logged-in user. */
  accountLoading: boolean;
  /** Plan id currently being sent to Stripe Checkout, if any. */
  subscribingId: string | null;
  onSubscribe: (plan: HostingPlanDTO) => void;
}

export function PlanCta({
  plan,
  account,
  accountLoading,
  subscribingId,
  onSubscribe,
}: PlanCtaProps) {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // /auth/check returns the full user incl. isVerified, which the local
  // auth-context User type does not declare.
  const emailVerified = Boolean(
    user && (user as { isVerified?: boolean }).isVerified === true,
  );

  const resendVerification = async () => {
    if (!user?.email || resending) return;
    setResending(true);
    try {
      const res: { message?: string } = await apiClient.resendVerification(
        user.email,
      );
      setResent(true);
      toast({
        title: 'Verification email sent',
        description: res?.message ?? 'Please check your inbox.',
      });
    } catch (err) {
      toast({
        title: 'Could not resend verification',
        description:
          err instanceof Error ? err.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setResending(false);
    }
  };

  // Session/account state still resolving — keep a same-size disabled button
  // so the card grid does not shift.
  if (authLoading || (user && accountLoading)) {
    return (
      <Button className="w-full" disabled>
        <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Checking…
      </Button>
    );
  }

  if (account) {
    return (
      <Button className="w-full" variant="outline" asChild>
        <Link href="/dashboard/subscription">Manage plan</Link>
      </Button>
    );
  }

  if (!plan.purchasable) {
    return (
      <Button className="w-full" variant="outline" disabled>
        Coming soon
      </Button>
    );
  }

  if (!user) {
    return (
      <Button className="w-full" asChild>
        <Link href={`/register?plan=${encodeURIComponent(plan.id)}`}>
          Get started
        </Link>
      </Button>
    );
  }

  if (!emailVerified) {
    return (
      <div className="w-full space-y-2">
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MailWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Verify your email address to subscribe to this plan.
        </p>
        <Button
          className="w-full"
          variant="outline"
          onClick={resendVerification}
          disabled={resending || resent}
        >
          {resending ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : resent ? (
            'Verification email sent'
          ) : (
            'Resend verification email'
          )}
        </Button>
      </div>
    );
  }

  const subscribing = subscribingId === plan.id;
  return (
    <Button
      className="w-full"
      onClick={() => onSubscribe(plan)}
      disabled={subscribingId !== null}
    >
      {subscribing ? (
        <>
          <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Redirecting to checkout…
        </>
      ) : (
        'Get started'
      )}
    </Button>
  );
}
