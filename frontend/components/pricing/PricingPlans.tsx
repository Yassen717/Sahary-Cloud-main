'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { getMyAccount, subscribe } from '@/lib/hosting-api';
import { useToast } from '@/hooks/use-toast';
import type { HostingAccountDTO, HostingPlanDTO } from '@/lib/hosting-types';
import { PlanCards } from './PlanCards';
import { PlanCta } from './PlanCta';
import { PlanComparison } from './PlanComparison';
import { clearPendingPlan } from './pending-plan';

interface PricingPlansProps {
  /** Plans fetched server-side; `null` means the API could not be reached. */
  plans: HostingPlanDTO[] | null;
}

export function PricingPlans({ plans }: PricingPlansProps) {
  const searchParams = useSearchParams();
  const checkoutCancelled = searchParams.get('checkout') === 'cancelled';
  const planParam = searchParams.get('plan');
  const highlightPlanId =
    plans?.some((p) => p.id === planParam) === true ? planParam : null;

  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  // undefined = not fetched yet (logged out users never fetch).
  const [fetchedAccount, setFetchedAccount] = useState<
    HostingAccountDTO | null | undefined
  >(undefined);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyAccount()
      .then((account) => {
        if (!cancelled) setFetchedAccount(account);
      })
      .catch(() => {
        // Status unknown — treat as "no account" so the CTA stays usable;
        // subscribe() surfaces the real backend error if there is one.
        if (!cancelled) setFetchedAccount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!highlightPlanId) return;
    document
      .getElementById(`plan-${highlightPlanId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightPlanId]);

  const account = user ? (fetchedAccount ?? null) : null;
  const accountLoading = Boolean(user) && fetchedAccount === undefined;

  const handleSubscribe = async (plan: HostingPlanDTO) => {
    setSubscribingId(plan.id);
    try {
      const session = await subscribe(plan.id);
      clearPendingPlan();
      window.location.assign(session.checkoutUrl);
    } catch (err) {
      setSubscribingId(null);
      toast({
        title: 'Checkout failed',
        description:
          err instanceof ApiError
            ? err.message
            : 'Could not start checkout. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (plans === null) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Pricing temporarily unavailable</AlertTitle>
        <AlertDescription>
          We could not load our hosting plans right now. Please check back in a
          few minutes or contact support if the problem persists.
          {account && (
            <span className="mt-3 block">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/subscription">Manage your plan</Link>
              </Button>
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (plans.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>No plans available yet</AlertTitle>
        <AlertDescription>
          Our hosting plans are not open for purchase yet — please check back
          soon.
          {account && (
            <span className="mt-3 block">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/subscription">Manage your plan</Link>
              </Button>
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-16">
      {checkoutCancelled && (
        <Alert>
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Checkout cancelled</AlertTitle>
          <AlertDescription>
            No charge was made. Pick a plan below whenever you are ready.
          </AlertDescription>
        </Alert>
      )}

      <PlanCards
        plans={plans}
        highlightPlanId={highlightPlanId}
        action={(plan) => (
          <PlanCta
            plan={plan}
            account={account}
            accountLoading={accountLoading || authLoading}
            subscribingId={subscribingId}
            onSubscribe={handleSubscribe}
          />
        )}
      />

      <section aria-labelledby="compare-plans">
        <h2
          id="compare-plans"
          className="mb-6 text-center text-2xl font-bold md:text-3xl"
        >
          Compare plans
        </h2>
        <PlanComparison plans={plans} />
      </section>
    </div>
  );
}
