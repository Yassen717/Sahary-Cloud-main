'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  getMyAccount,
  getPlans,
  getDatabases,
  subscribe,
  changePlan,
  cancelSubscription,
  resumeSubscription,
  openBillingPortal,
  terminateAccount,
} from '@/lib/hosting-api';
import type {
  HostingAccountDTO,
  HostingDatabasesDTO,
  HostingPlanDTO,
} from '@/lib/hosting-types';
import { PlanChooser } from '@/components/subscription/PlanChooser';
import { ChangePlanDialog } from '@/components/subscription/ChangePlanDialog';
import { DeleteAccountDialog } from '@/components/subscription/DeleteAccountDialog';
import { CheckoutSetup } from '@/components/subscription/CheckoutSetup';
import { UsageBar } from '@/components/hosting/UsageBar';
import { StatusBadge } from '@/components/hosting/StatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FolderOpen,
  Globe,
  Info,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;

type PollOutcome = 'ready' | 'timeout' | 'failed' | null;

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'long' }) : null;

const SUBSCRIPTION_STATUS_CHIP: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  trialing: { label: 'Trialing', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  past_due: { label: 'Past due', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  unpaid: { label: 'Unpaid', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  canceled: { label: 'Canceled', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
  incomplete: { label: 'Incomplete', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  incomplete_expired: { label: 'Expired', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
};

function LoadingState() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function SubscriptionManager() {
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Latch the checkout return param once — router.replace() must not re-trigger the flow.
  const [checkoutParam] = useState(() => searchParams.get('checkout'));

  const [initialLoading, setInitialLoading] = useState(checkoutParam !== 'success');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [account, setAccount] = useState<HostingAccountDTO | null>(null);
  const [plans, setPlans] = useState<HostingPlanDTO[]>([]);
  const [dbInfo, setDbInfo] = useState<HostingDatabasesDTO | null>(null);

  const [polling, setPolling] = useState(checkoutParam === 'success');
  const [pollOutcome, setPollOutcome] = useState<PollOutcome>(null);
  const [showCancelled] = useState(checkoutParam === 'cancelled');

  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);

  const refreshAccount = useCallback(async () => {
    try {
      const acc = await getMyAccount();
      setAccount(acc);
      return acc;
    } catch (err) {
      toast({
        title: 'Refresh failed',
        description: errorMessage(err, 'Could not refresh your account'),
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    // Plans are needed for the chooser and the change-plan dialog; non-fatal.
    getPlans()
      .then((data) => {
        if (!cancelled) setPlans(data);
      })
      .catch(() => undefined);

    if (checkoutParam === 'success') {
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      const finish = (outcome: PollOutcome) => {
        if (cancelled) return;
        setPolling(false);
        setPollOutcome(outcome);
        router.replace('/dashboard/subscription', { scroll: false });
      };
      const tick = async (): Promise<void> => {
        while (!cancelled) {
          try {
            const acc = await getMyAccount();
            if (cancelled) return;
            setAccount(acc);
            if (acc?.status === 'ACTIVE') return finish('ready');
            if (acc?.status === 'PROVISION_FAILED') return finish('failed');
            if (acc && acc.status !== 'PROVISIONING') return finish(null);
          } catch {
            // Transient API error — keep polling until the deadline.
          }
          if (Date.now() >= deadline) return finish('timeout');
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      };
      void tick().then(() => {
        if (!cancelled) setInitialLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    if (checkoutParam === 'cancelled') {
      // showCancelled is already initialized true — just strip the query param.
      router.replace('/dashboard/subscription', { scroll: false });
    }

    getMyAccount()
      .then((acc) => {
        if (!cancelled) setAccount(acc);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(errorMessage(err, 'Failed to load your subscription'));
        }
      })
      .finally(() => {
        if (!cancelled) setInitialLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // checkoutParam is latched at mount and router identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutParam]);

  // Database usage row — only meaningful while the account is ACTIVE.
  useEffect(() => {
    if (account?.status !== 'ACTIVE') return;
    let live = true;
    getDatabases()
      .then((data) => {
        if (live) setDbInfo(data);
      })
      .catch(() => {
        if (live) setDbInfo(null);
      });
    return () => {
      live = false;
    };
  }, [account]);

  const handleSubscribe = async (plan: HostingPlanDTO) => {
    setBusyPlanId(plan.id);
    setSubscribeError(null);
    try {
      const session = await subscribe(plan.id);
      window.location.assign(session.checkoutUrl);
      // Keep the busy state — the browser is navigating to Stripe Checkout.
    } catch (err) {
      setBusyPlanId(null);
      if (err instanceof ApiError && err.status === 403) {
        setSubscribeError(err.message);
      } else {
        toast({
          title: 'Checkout failed',
          description: errorMessage(err, 'Could not start checkout'),
          variant: 'destructive',
        });
      }
    }
  };

  const handleResendVerification = async () => {
    if (!user?.email) return;
    setResendBusy(true);
    try {
      await apiClient.resendVerification(user.email);
      toast({ title: 'Verification email sent', description: 'Check your inbox for the verification link.' });
    } catch (err) {
      toast({
        title: 'Could not resend email',
        description: errorMessage(err, 'Please try again later'),
        variant: 'destructive',
      });
    } finally {
      setResendBusy(false);
    }
  };

  const handlePortal = async () => {
    setPortalBusy(true);
    try {
      const session = await openBillingPortal();
      window.location.assign(session.portalUrl);
    } catch (err) {
      toast({
        title: 'Billing portal unavailable',
        description: errorMessage(err, 'Could not open the billing portal'),
        variant: 'destructive',
      });
      setPortalBusy(false);
    }
  };

  const handleChangePlan = async (planId: string) => {
    await changePlan(planId);
    toast({ title: 'Plan changed', description: 'Your new plan is now active.' });
    await refreshAccount();
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const result = await cancelSubscription();
      const until = formatDate(result.subscription?.currentPeriodEnd);
      toast({
        title: 'Subscription canceled',
        description: until
          ? `Your hosting stays active until ${until}.`
          : 'Your hosting stays active until the end of the billing period.',
      });
      await refreshAccount();
    } catch (err) {
      toast({
        title: 'Cancel failed',
        description: errorMessage(err, 'Could not cancel the subscription'),
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleResume = async () => {
    setResuming(true);
    try {
      await resumeSubscription();
      toast({ title: 'Subscription resumed', description: 'Your plan will renew automatically.' });
      await refreshAccount();
    } catch (err) {
      toast({
        title: 'Resume failed',
        description: errorMessage(err, 'Could not resume the subscription'),
        variant: 'destructive',
      });
    } finally {
      setResuming(false);
    }
  };

  const handleTerminate = async () => {
    if (!account) return;
    await terminateAccount(account.id);
    toast({
      title: 'Hosting account deleted',
      description: 'Your files are kept for a short retention period before removal.',
    });
    await refreshAccount();
  };

  /* ---------- Render ---------- */

  if (polling) {
    return <CheckoutSetup currentStep={1} />;
  }

  if (pollOutcome === 'ready') {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500" aria-hidden="true" />
          <CardTitle className="text-2xl">Your hosting is ready</CardTitle>
          <CardDescription>
            {account ? (
              <>
                <span className="font-mono">{account.domain}</span> is set up and online.
              </>
            ) : (
              'Your hosting account is set up and online.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/dashboard/hosting/files">
              <FolderOpen className="me-2 h-4 w-4" aria-hidden="true" />
              Open file manager
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/hosting/domains">
              <Globe className="me-2 h-4 w-4" aria-hidden="true" />
              Manage domains
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/hosting">
              <LayoutDashboard className="me-2 h-4 w-4" aria-hidden="true" />
              Hosting overview
            </Link>
          </Button>
          <Button variant="ghost" onClick={() => setPollOutcome(null)}>
            View subscription details
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (pollOutcome === 'timeout') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Setup is taking a little longer</CardTitle>
          <CardDescription>
            Your payment went through and your hosting is still being set up. This is taking
            longer than usual — we will email you as soon as it is ready. You can also check
            again in a moment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              setPollOutcome(null);
              void refreshAccount();
            }}
          >
            <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
            Check status
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (pollOutcome === 'failed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            Setup needs attention
          </CardTitle>
          <CardDescription>
            Your payment went through, but the automatic setup of your hosting account ran
            into a problem. Our team has been notified and will finish the setup for you —
            you do not need to pay again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              setPollOutcome(null);
              void refreshAccount();
            }}
          >
            View my subscription
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (initialLoading) {
    return <LoadingState />;
  }

  if (loadError) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
            Could not load your subscription
          </CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              setInitialLoading(true);
              setLoadError(null);
              getMyAccount()
                .then(setAccount)
                .catch((err) => setLoadError(errorMessage(err, 'Failed to load your subscription')))
                .finally(() => setInitialLoading(false));
            }}
          >
            <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const subscription = account?.subscription ?? null;
  const subscriptionStatus = subscription?.status ?? null;
  const statusChip = subscriptionStatus
    ? SUBSCRIPTION_STATUS_CHIP[subscriptionStatus] ?? {
        label: subscriptionStatus,
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      }
    : null;
  const periodEnd = formatDate(subscription?.currentPeriodEnd);
  const isTerminated = account?.status === 'TERMINATED';
  const canManage = !!subscription && account?.status === 'ACTIVE';
  const showDangerZone = !!account && !isTerminated && account.status !== 'PROVISIONING';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Subscription</h1>
        <p className="text-sm text-muted-foreground">
          Manage your hosting plan, billing and account lifecycle.
        </p>
      </div>

      {showCancelled && (
        <Alert>
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Checkout cancelled</AlertTitle>
          <AlertDescription>
            You left the checkout before completing payment. Choose a plan below whenever
            you are ready.
          </AlertDescription>
        </Alert>
      )}

      {subscribeError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Could not start checkout</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{subscribeError}</p>
            {user?.email && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResendVerification}
                disabled={resendBusy}
              >
                {resendBusy && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Resend verification email
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* ---------- Account status banners ---------- */}
      {account?.status === 'PROVISIONING' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              Setting up your hosting
            </CardTitle>
            <CardDescription>
              Your account is being provisioned. This page updates automatically — hang tight.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => void refreshAccount()}>
              <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
              Refresh status
            </Button>
          </CardContent>
        </Card>
      )}

      {account?.status === 'PROVISION_FAILED' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Your hosting setup needs attention</AlertTitle>
          <AlertDescription>
            Automatic setup of your hosting account did not finish. Your payment is safe —
            our team has been notified and will complete the setup. You do not need to pay
            again or take any action.
          </AlertDescription>
        </Alert>
      )}

      {account?.status === 'SUSPENDED' && account.suspendReason === 'PAYMENT_FAILED' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Your account is suspended — payment failed</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Your last invoice could not be paid, so your website is offline. Update your
              payment method to bring it back automatically.
            </p>
            <Button size="sm" onClick={handlePortal} disabled={portalBusy}>
              {portalBusy ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CreditCard className="me-2 h-4 w-4" aria-hidden="true" />
              )}
              Update payment method
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {account?.status === 'SUSPENDED' && account.suspendReason === 'SUBSCRIPTION_CANCELED' && (
        <Alert>
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Your subscription ended</AlertTitle>
          <AlertDescription>
            Your hosting account is suspended and your site is offline. Your files are kept
            for a limited retention period before being permanently removed — re-subscribe
            below to restore your website.
          </AlertDescription>
        </Alert>
      )}

      {account?.status === 'SUSPENDED' && account.suspendReason === 'BANDWIDTH_EXCEEDED' && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Your account used all its bandwidth</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Your website is offline because it exceeded its monthly bandwidth quota. It
              reactivates automatically at the start of the next billing cycle — or move to a
              larger plan now.
            </p>
            {subscription && (
              <Button size="sm" onClick={() => setChangePlanOpen(true)}>
                <ArrowLeftRight className="me-2 h-4 w-4" aria-hidden="true" />
                Change plan
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {account?.status === 'SUSPENDED' &&
        (account.suspendReason === 'ADMIN' || account.suspendReason === 'ABUSE') && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Your account is suspended</AlertTitle>
            <AlertDescription>
              This account was suspended by an administrator. Please contact support for more
              information.
            </AlertDescription>
          </Alert>
        )}

      {isTerminated && (
        <Alert>
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>This hosting account was terminated</AlertTitle>
          <AlertDescription>
            Your files are kept for a short retention period before being permanently
            removed. Choose a plan below to start a fresh hosting account.
          </AlertDescription>
        </Alert>
      )}

      {/* ---------- No account / terminated: plan chooser ---------- */}
      {(!account || isTerminated) && (
        <Card>
          <CardHeader>
            <CardTitle>Choose your hosting plan</CardTitle>
            <CardDescription>
              Every plan includes a free subdomain, SSL, MySQL database, FTP access and our
              web file manager.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanChooser plans={plans} busyPlanId={busyPlanId} onSelect={handleSubscribe} />
          </CardContent>
        </Card>
      )}

      {/* ---------- Suspended by cancel: re-subscribe ---------- */}
      {account?.status === 'SUSPENDED' && account.suspendReason === 'SUBSCRIPTION_CANCELED' && (
        <Card>
          <CardHeader>
            <CardTitle>Re-subscribe to restore your site</CardTitle>
            <CardDescription>
              Pick a plan — your files and settings are still here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanChooser plans={plans} busyPlanId={busyPlanId} onSelect={handleSubscribe} />
          </CardContent>
        </Card>
      )}

      {/* ---------- Current plan card ---------- */}
      {account && !isTerminated && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <CardTitle>{account.plan.name}</CardTitle>
                <StatusBadge status={account.status} suspendReason={account.suspendReason} />
                {statusChip && (
                  <Badge variant="outline" className={statusChip.className}>
                    {statusChip.label}
                  </Badge>
                )}
              </div>
              <span className="text-xl font-bold">
                ${account.plan.monthlyPrice.toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </span>
            </div>
            <CardDescription>
              {subscription?.cancelAtPeriodEnd ? (
                <>Cancels on {periodEnd ?? 'the end of the billing period'} — your site stays online until then.</>
              ) : subscriptionStatus === 'canceled' ? (
                <>Access until {periodEnd ?? 'the end of the billing period'}.</>
              ) : periodEnd ? (
                <>Renews on {periodEnd}.</>
              ) : subscription ? null : (
                'No Stripe subscription is linked to this account.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscriptionStatus === 'past_due' && account.status === 'ACTIVE' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Payment failed</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Your latest invoice could not be paid. Update your payment method to keep
                    your site online.
                  </span>
                  <Button size="sm" variant="outline" onClick={handlePortal} disabled={portalBusy}>
                    {portalBusy ? (
                      <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CreditCard className="me-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Update payment method
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {canManage && (
              <div className="flex flex-wrap gap-2">
                {subscription.cancelAtPeriodEnd ? (
                  <Button onClick={handleResume} disabled={resuming}>
                    {resuming && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                    Resume subscription
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setChangePlanOpen(true)}>
                      <ArrowLeftRight className="me-2 h-4 w-4" aria-hidden="true" />
                      Change plan
                    </Button>
                    <Button variant="outline" onClick={() => setCancelOpen(true)}>
                      Cancel subscription
                    </Button>
                  </>
                )}
                <Button variant="outline" onClick={handlePortal} disabled={portalBusy}>
                  {portalBusy ? (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ExternalLink className="me-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Manage billing &amp; invoices
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------- Usage ---------- */}
      {account && !isTerminated && account.status !== 'PROVISIONING' && (
        <Card>
          <CardHeader>
            <CardTitle>Usage &amp; limits</CardTitle>
            <CardDescription>Resource usage on your current plan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageBar
              label="Disk space"
              used={account.usage.diskUsedGB}
              quota={account.usage.diskQuotaGB}
              level={account.usage.diskLevel}
            />
            <UsageBar
              label="Bandwidth (this cycle)"
              used={account.usage.bandwidthUsedGB}
              quota={account.usage.bandwidthQuotaGB}
              level={account.usage.bandwidthLevel}
            />
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-muted-foreground">Domains</span>
                <span className="font-medium">
                  {account.domains.length} / {account.plan.maxDomains}
                </span>
              </div>
              {dbInfo?.enabled && (
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-muted-foreground">Databases</span>
                  <span className="font-medium">
                    {dbInfo.databases.length} / {dbInfo.limit}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- Danger zone ---------- */}
      {showDangerZone && account && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Permanently delete this hosting account. Your subscription is canceled
              immediately and your files are kept for a short retention period before
              removal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete my hosting account
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---------- Dialogs ---------- */}
      {account && (
        <ChangePlanDialog
          open={changePlanOpen}
          onOpenChange={setChangePlanOpen}
          currentPlan={account.plan}
          plans={plans}
          onConfirm={handleChangePlan}
        />
      )}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Your hosting stays active until{' '}
              {periodEnd ?? 'the end of the current billing period'}, then your account is
              suspended and your site goes offline. Your files are kept for a limited
              retention period before removal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(event) => {
                event.preventDefault();
                void handleCancel().then(() => setCancelOpen(false));
              }}
            >
              {cancelling ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Cancelling...
                </>
              ) : (
                'Cancel subscription'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {account && (
        <DeleteAccountDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          domain={account.domain}
          onConfirm={handleTerminate}
        />
      )}
    </div>
  );
}

export default function DashboardSubscriptionPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SubscriptionManager />
    </Suspense>
  );
}
