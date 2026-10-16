'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CheckCircle,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { getMyAccount } from '@/lib/hosting-api';
import type { HostingAccountDTO } from '@/lib/hosting-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccountStatusAlert } from '@/components/hosting/AccountStatusAlert';
import { HostingQuickLinks } from '@/components/hosting/QuickLinks';
import { StatusBadge } from '@/components/hosting/StatusBadge';
import { SslBadge } from '@/components/hosting/SslBadge';
import { UsageBar } from '@/components/hosting/UsageBar';
import { usePolling } from '@/components/hosting/usePolling';

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'never'
    : formatDistanceToNow(date, { addSuffix: true });
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : format(date, 'PPP');
}

export default function HostingOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<HostingAccountDTO | null>(null);

  const loadAccount = useCallback(async () => {
    try {
      setAccount(await getMyAccount());
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load your hosting account.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the async load resolves
    void loadAccount();
  }, [loadAccount]);

  // Poll every 3s (up to 2 min) while the account is provisioning; the
  // polling stops as soon as the status flips to ACTIVE/PROVISION_FAILED.
  const pollAccount = useCallback(async () => {
    const next = await getMyAccount();
    if (next) setAccount(next);
  }, []);
  usePolling(account?.status === 'PROVISIONING', pollAccount, {
    intervalMs: 3000,
    timeoutMs: 120_000,
  });

  const refresh = () => {
    setRefreshing(true);
    void loadAccount();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Couldn&apos;t load hosting</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => { setLoading(true); void loadAccount(); }}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!account) {
    return (
      <Card className="border-2 border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Get your website online
          </CardTitle>
          <CardDescription>
            You don&apos;t have a hosting account yet. Pick a plan and your site
            goes live on a free subdomain in minutes — solar powered, SSL
            included.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/pricing">Choose a plan</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const domains = account.domains ?? [];
  const bandwidthReset = formatDate(account.usage.bandwidthCycleEnd);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hosting</h1>
          <p className="text-muted-foreground mt-1">Your site at a glance.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh hosting data"
        >
          <RefreshCw className={`h-3.5 w-3.5 me-1 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Account card */}
      <Card>
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
            <Link href="/dashboard/subscription">Manage plan</Link>
          </Button>
        </CardContent>
      </Card>

      <AccountStatusAlert account={account} />

      {account.status === 'PROVISIONING' && (
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          Checking setup progress every few seconds…
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage</CardTitle>
            <CardDescription>
              Updated {relativeTime(account.usage.updatedAt)}
              {bandwidthReset ? ` · bandwidth resets ${bandwidthReset}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        {/* Domains summary */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Domains</CardTitle>
                <CardDescription>
                  {domains.length} of {account.plan.maxDomains} custom domains used
                </CardDescription>
              </div>
              <Button variant="link" size="sm" className="px-0" asChild>
                <Link href="/dashboard/hosting/domains">
                  Manage
                  <ChevronRight className="h-3.5 w-3.5 ms-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="font-mono text-sm truncate">{account.domain}</span>
                </span>
                <SslBadge status={account.ssl.enabled ? 'ACTIVE' : 'NONE'} />
              </li>
              {domains.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    {d.isVerified ? (
                      <CheckCircle className="h-4 w-4 shrink-0 text-green-600" aria-label="Verified" />
                    ) : (
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Pending verification" />
                    )}
                    <span className="font-mono text-sm truncate">{d.domain}</span>
                  </span>
                  <SslBadge status={d.isVerified ? d.ssl.status : 'NONE'} />
                </li>
              ))}
            </ul>
            {domains.length > 4 && (
              <p className="text-xs text-muted-foreground mt-2">
                + {domains.length - 4} more — see the Domains tab.
              </p>
            )}
            {domains.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                No custom domains yet — your site is live on the subdomain above.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <section aria-label="Quick actions" className="space-y-3">
        <h2 className="text-lg font-semibold">Quick actions</h2>
        <HostingQuickLinks />
      </section>

      {/* Publish guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" />
            Publish your site
          </CardTitle>
          <CardDescription>Three steps to get online.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                1
              </span>
              <div>
                <p className="font-medium text-sm">Upload your files</p>
                <p className="text-sm text-muted-foreground">
                  Add an <code className="font-mono text-xs">index.html</code> in the{' '}
                  <Link className="underline" href="/dashboard/hosting/files">file manager</Link>
                  {' '}or upload your site via{' '}
                  <Link className="underline" href="/dashboard/hosting/ftp">FTP</Link>.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                2
              </span>
              <div>
                <p className="font-medium text-sm">Visit your URL</p>
                <p className="text-sm text-muted-foreground">
                  Your site is live at{' '}
                  <a
                    className="underline font-mono text-xs"
                    href={account.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {account.domain}
                  </a>
                  .
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                3
              </span>
              <div>
                <p className="font-medium text-sm">Add a custom domain</p>
                <p className="text-sm text-muted-foreground">
                  Bring your own domain and verify it in{' '}
                  <Link className="underline" href="/dashboard/hosting/domains">Domains</Link>
                  {' '}— we&apos;ll issue its{' '}
                  <ShieldCheck className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
                  {' '}SSL certificate automatically.
                </p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
