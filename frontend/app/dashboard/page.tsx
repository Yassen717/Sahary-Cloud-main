'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  ChevronRight,
  ExternalLink,
  Globe,
  Leaf,
  Loader2,
  MailWarning,
  Zap,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getMyAccount } from '@/lib/hosting-api';
import { features } from '@/lib/features';
import type { HostingAccountDTO } from '@/lib/hosting-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { VmSummary } from '@/components/dashboard/VmSummary';
import { AccountStatusAlert } from '@/components/hosting/AccountStatusAlert';
import { HostingQuickLinks } from '@/components/hosting/QuickLinks';
import { StatusBadge } from '@/components/hosting/StatusBadge';
import { UsageBar } from '@/components/hosting/UsageBar';
import { usePolling } from '@/components/hosting/usePolling';
import type { SolarChartPoint } from '@/components/dashboard/SolarChart';

// Lazy load heavy chart component
const SolarChart = dynamic(
  () => import('@/components/dashboard/SolarChart').then(mod => ({ default: mod.SolarChart })),
  {
    loading: () => (
      <Card>
        <CardHeader>
          <CardTitle>Solar Production</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    ),
    ssr: false
  }
);

interface SolarStatus {
  status?: string;
  production?: number;
  consumption?: number;
  efficiency?: number;
  batteryLevel?: number | null;
}

interface SolarHistoryRecord {
  timestamp: string;
  production: number | string;
  consumption: number | string;
}

const toChartData = (records: SolarHistoryRecord[] = []): SolarChartPoint[] =>
  [...records].reverse().map((record) => ({
    time: new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    production: Number(record.production) || 0,
    consumption: Number(record.consumption) || 0,
  }));

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'never'
    : formatDistanceToNow(date, { addSuffix: true });
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState('');
  const [account, setAccount] = useState<HostingAccountDTO | null>(null);
  const [accountFailed, setAccountFailed] = useState(false);
  const [solarStatus, setSolarStatus] = useState<SolarStatus | null>(null);
  const [solarHistory, setSolarHistory] = useState<SolarChartPoint[]>([]);
  const [co2SavedKg, setCo2SavedKg] = useState<number | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const loadDashboardData = useCallback(async () => {
    const results = await Promise.allSettled([
      getMyAccount(),
      apiClient.getSolarStatus(),
      apiClient.getSolarHistory(),
      apiClient.getEnvironmentalImpact(),
    ]);
    const [accountRes, solarRes, historyRes, impactRes] = results;

    if (accountRes.status === 'fulfilled') {
      setAccount(accountRes.value);
      setAccountFailed(false);
    } else {
      setAccountFailed(true);
    }
    if (solarRes.status === 'fulfilled') {
      setSolarStatus((solarRes.value?.data as SolarStatus | undefined) ?? null);
    }
    if (historyRes.status === 'fulfilled') {
      setSolarHistory(toChartData(historyRes.value?.data as SolarHistoryRecord[] | undefined));
    }
    if (impactRes.status === 'fulfilled') {
      const impact = (impactRes.value?.data as { environmentalImpact?: { co2Saved?: number } } | undefined)
        ?.environmentalImpact;
      setCo2SavedKg(typeof impact?.co2Saved === 'number' ? impact.co2Saved : null);
    }

    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.length === results.length) {
      setFatalError(errorMessage(failures[0].reason, 'Could not load your dashboard.'));
    } else {
      setFatalError('');
      // The CO2 line is optional — only the account/solar calls warn on failure.
      const coreFailures = [accountRes, solarRes, historyRes].filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (coreFailures.length > 0) {
        toast({
          title: 'Some data failed to load',
          description: errorMessage(coreFailures[0].reason, 'Please try again.'),
          variant: 'destructive',
        });
      }
    }

    setLoading(false);
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the async load resolves
    void loadDashboardData();
  }, [loadDashboardData]);

  // While the account is provisioning, poll until it flips (max ~2 minutes).
  const refreshAccount = useCallback(async () => {
    const next = await getMyAccount();
    if (next) setAccount(next);
  }, []);
  usePolling(account?.status === 'PROVISIONING', refreshAccount, {
    intervalMs: 3000,
    timeoutMs: 120_000,
  });

  const handleResendVerification = async () => {
    if (!user?.email || resending || resent) return;
    try {
      setResending(true);
      await apiClient.resendVerification(user.email);
      setResent(true);
      toast({
        title: 'Verification email sent',
        description: `We sent a new verification link to ${user.email}.`,
      });
    } catch (err) {
      toast({
        title: 'Could not resend the email',
        description: errorMessage(err, 'Please try again in a moment.'),
        variant: 'destructive',
      });
    } finally {
      setResending(false);
    }
  };

  const domains = account?.domains ?? [];
  const certExpiry = account ? shortDate(account.ssl.expiresAt) : null;
  const sslCounts = domains.reduce<Record<string, number>>((acc, d) => {
    acc[d.ssl.status] = (acc[d.ssl.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-3xl font-bold mb-2">
          {user?.firstName ? `Welcome back, ${user.firstName}` : 'Dashboard'}
        </h1>
        <p className="text-muted-foreground">Here&apos;s your hosting at a glance.</p>
      </div>

      {!authLoading && user && user.isVerified === false && (
        <Alert>
          <MailWarning className="h-4 w-4" />
          <AlertTitle>Verify your email address</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              We sent a verification link to <strong>{user.email}</strong>. Verify
              it to unlock domain, file and billing changes.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleResendVerification}
              disabled={resending || resent}
            >
              {resending && <Loader2 className="h-3.5 w-3.5 animate-spin me-1" />}
              {resent ? 'Email sent' : 'Resend verification'}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : fatalError ? (
        <Card className="border-destructive animate-fade-in">
          <CardHeader>
            <CardTitle className="text-destructive">Connection Error</CardTitle>
            <CardDescription>{fatalError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => { setLoading(true); void loadDashboardData(); }} className="transition-all-smooth hover:scale-105">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Hosting section */}
          <section aria-label="Hosting" className="space-y-6">
            <h2 className="text-lg font-semibold">Hosting</h2>

            {accountFailed ? (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="text-destructive text-base">Couldn&apos;t load your hosting account</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" onClick={() => { setLoading(true); void loadDashboardData(); }}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : !account ? (
              <Card className="border-2 border-dashed">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Get your website online
                  </CardTitle>
                  <CardDescription>
                    You don&apos;t have a hosting account yet. Pick a plan and
                    your site goes live on a free subdomain in minutes — solar
                    powered, SSL included.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="transition-all-smooth hover:scale-105">
                    <Link href="/pricing">Choose a plan</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="animate-fade-in">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2">
                          <Globe className="h-5 w-5 text-primary shrink-0" />
                          <span className="font-mono truncate">{account.domain}</span>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {account.plan.name} plan · ${account.plan.monthlyPrice}/month
                        </CardDescription>
                      </div>
                      <StatusBadge status={account.status} suspendReason={account.suspendReason} />
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <a href={account.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 me-1" />
                        Visit site
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/hosting">Open hosting panel</Link>
                    </Button>
                  </CardContent>
                </Card>

                <AccountStatusAlert account={account} />

                <div
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  role="region"
                  aria-label="Hosting summary"
                >
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Plan</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{account.plan.name}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        ${account.plan.monthlyPrice}/month
                        {account.subscription?.cancelAtPeriodEnd ? ' · cancels at period end' : ''}
                      </p>
                      <Button variant="link" size="sm" className="px-0 h-auto mt-2" asChild>
                        <Link href="/dashboard/subscription">
                          Manage subscription
                          <ChevronRight className="h-3.5 w-3.5 ms-1" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Usage</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <UsageBar
                        label="Disk"
                        used={account.usage.diskUsedGB}
                        quota={account.usage.diskQuotaGB}
                        level={account.usage.diskLevel}
                      />
                      <UsageBar
                        label="Bandwidth"
                        used={account.usage.bandwidthUsedGB}
                        quota={account.usage.bandwidthQuotaGB}
                        level={account.usage.bandwidthLevel}
                      />
                      <p className="text-xs text-muted-foreground">
                        Updated {relativeTime(account.usage.updatedAt)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Domains &amp; SSL</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {domains.length}
                        <span className="text-base font-normal text-muted-foreground">
                          {' '}/ {account.plan.maxDomains}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        custom domains used
                        {domains.length > 0 && (
                          <>
                            {' · '}
                            {sslCounts.ACTIVE ?? 0} SSL active
                            {(sslCounts.PENDING ?? 0) > 0 && `, ${sslCounts.PENDING} pending`}
                            {(sslCounts.FAILED ?? 0) > 0 && `, ${sslCounts.FAILED} failed`}
                          </>
                        )}
                      </p>
                      <Button variant="link" size="sm" className="px-0 h-auto mt-2" asChild>
                        <Link href="/dashboard/hosting/domains">
                          Manage domains
                          <ChevronRight className="h-3.5 w-3.5 ms-1" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Site URL</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-mono font-medium truncate">{account.domain}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {account.ssl.enabled
                          ? `HTTPS enabled${certExpiry ? ` · cert expires ${certExpiry}` : ''}`
                          : 'HTTP only'}
                      </p>
                      <Button asChild size="sm" variant="outline" className="mt-3">
                        <a href={account.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 me-1" />
                          Visit site
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <HostingQuickLinks />
              </>
            )}
          </section>

          {/* Solar section */}
          <section aria-label="Solar power" className="space-y-6">
            <h2 className="text-lg font-semibold">Solar power</h2>
            <div
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
              role="region"
              aria-label="Solar statistics"
            >
              <StatsCard
                title="Solar Production"
                value={solarStatus ? `${(solarStatus.production ?? 0).toFixed(2)} kW` : '—'}
                description={solarStatus ? `${(solarStatus.efficiency ?? 0).toFixed(1)}% efficiency` : 'Unavailable'}
                icon={Zap}
                iconColor="text-yellow-500"
                delay={0}
              />
              <StatsCard
                title="Efficiency"
                value={solarStatus ? `${(solarStatus.efficiency ?? 0).toFixed(1)}%` : '—'}
                description={solarStatus ? `${(solarStatus.consumption ?? 0).toFixed(2)} kW consumed` : 'Unavailable'}
                icon={Activity}
                iconColor="text-green-500"
                delay={100}
              />
              <StatsCard
                title="Battery Level"
                value={solarStatus?.batteryLevel != null ? `${solarStatus.batteryLevel}%` : '—'}
                description={solarStatus?.status ? `System ${solarStatus.status}` : 'Status unavailable'}
                icon={Activity}
                iconColor="text-blue-500"
                delay={200}
              />
            </div>

            <SolarChart data={solarHistory} />

            {co2SavedKg !== null && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Leaf className="h-4 w-4 text-green-600" aria-hidden="true" />
                Solar energy saved about {co2SavedKg} kg of CO₂ today.
              </p>
            )}
          </section>

          {features.vps && <VmSummary />}
        </>
      )}
    </div>
  );
}
