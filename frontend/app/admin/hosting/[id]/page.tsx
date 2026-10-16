'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApiError } from '@/lib/api';
import {
  adminActivate,
  adminGetAccount,
  adminListPlans,
  adminRetryProvisioning,
  adminSuspend,
  adminTerminate,
} from '@/lib/hosting-api';
import type {
  AdminHostingAccountDetailDTO,
  AdminHostingPlanDTO,
} from '@/lib/hosting-types';
import { AdminNav } from '@/components/admin/AdminNav';
import { NotAuthorized } from '@/components/admin/NotAuthorized';
import {
  ConfirmActionDialog,
  SuspendAccountDialog,
  TerminateAccountDialog,
} from '@/components/admin/AccountActionDialogs';
import { StatusBadge } from '@/components/hosting/StatusBadge';
import { SslBadge } from '@/components/hosting/SslBadge';
import { UsageBar } from '@/components/hosting/UsageBar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle,
  Database,
  Globe,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : null;

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end font-medium">{value}</span>
    </div>
  );
}

export default function AdminHostingAccountDetailPage() {
  const { toast } = useToast();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [account, setAccount] = useState<AdminHostingAccountDetailDTO | null>(null);
  const [plans, setPlans] = useState<AdminHostingPlanDTO[]>([]);
  const [dialog, setDialog] = useState<'suspend' | 'activate' | 'retry' | 'terminate' | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    adminGetAccount(id)
      .then((result) => {
        if (!live) return;
        setAccount(result);
        setLoadError(null);
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(err.message);
        } else if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(errorMessage(err, 'Failed to load the hosting account'));
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [id, reloadKey]);

  useEffect(() => {
    let live = true;
    adminListPlans()
      .then((result) => {
        if (live) setPlans(result);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const runAction = useCallback(
    async (action: () => Promise<AdminHostingAccountDetailDTO>, successMessage: string) => {
      try {
        const updated = await action();
        setAccount(updated);
        toast({ title: 'Done', description: successMessage });
      } catch (err) {
        toast({
          title: 'Action failed',
          description:
            err instanceof ApiError && err.status === 403
              ? 'Only super-admins can perform this action.'
              : errorMessage(err, 'The action failed'),
          variant: 'destructive',
        });
        throw err;
      }
    },
    [toast],
  );

  if (forbidden) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <AdminNav />
        <NotAuthorized />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <AdminNav />

      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/hosting">
            <ArrowLeft className="me-2 h-4 w-4" aria-hidden="true" />
            Back to hosting accounts
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : notFound ? (
        <Card>
          <CardHeader>
            <CardTitle>Account not found</CardTitle>
            <CardDescription>
              This hosting account does not exist or was already removed.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : loadError || !account ? (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              Could not load the account
            </CardTitle>
            <CardDescription>{loadError ?? 'Unknown error'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <AdminHostingAccountDetail
          account={account}
          plans={plans}
          onOpenDialog={setDialog}
        />
      )}

      {account && (
        <>
          <SuspendAccountDialog
            open={dialog === 'suspend'}
            onOpenChange={(open) => setDialog(open ? 'suspend' : null)}
            domain={account.domain}
            onConfirm={(note) =>
              runAction(() => adminSuspend(account.id, note), `Suspended ${account.domain}`)
            }
          />
          <ConfirmActionDialog
            open={dialog === 'activate'}
            onOpenChange={(open) => setDialog(open ? 'activate' : null)}
            title={`Activate ${account.domain}`}
            description="The website comes back online and FTP/MySQL access is restored. The owner is notified."
            confirmLabel="Activate account"
            onConfirm={() =>
              runAction(() => adminActivate(account.id), `Activated ${account.domain}`)
            }
          />
          <ConfirmActionDialog
            open={dialog === 'retry'}
            onOpenChange={(open) => setDialog(open ? 'retry' : null)}
            title={`Retry provisioning for ${account.domain}`}
            description="Re-runs the provisioning steps that failed (document root, MySQL, FTP, SSL, vhost). The previous error is cleared if the retry succeeds."
            confirmLabel="Retry provisioning"
            onConfirm={() =>
              runAction(
                () => adminRetryProvisioning(account.id),
                `Retrying provisioning for ${account.domain}`,
              )
            }
          />
          <TerminateAccountDialog
            open={dialog === 'terminate'}
            onOpenChange={(open) => setDialog(open ? 'terminate' : null)}
            domain={account.domain}
            onConfirm={() =>
              runAction(() => adminTerminate(account.id), `Terminated ${account.domain}`)
            }
          />
        </>
      )}
    </div>
  );
}

function AdminHostingAccountDetail({
  account,
  plans,
  onOpenDialog,
}: {
  account: AdminHostingAccountDetailDTO;
  plans: AdminHostingPlanDTO[];
  onOpenDialog: (dialog: 'suspend' | 'activate' | 'retry' | 'terminate') => void;
}) {
  const plan = plans.find((p) => p.id === account.plan.id) ?? null;
  const subscription = account.subscription;
  const suspendReason = account.suspendReason?.replace(/_/g, ' ').toLowerCase() ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{account.domain}</h1>
            <StatusBadge status={account.status} suspendReason={account.suspendReason} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Owned by {account.owner.firstName} {account.owner.lastName} ({account.owner.email})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {account.status === 'SUSPENDED' && (
            <Button size="sm" onClick={() => onOpenDialog('activate')}>
              <Play className="me-2 h-4 w-4" aria-hidden="true" />
              Activate
            </Button>
          )}
          {account.status === 'ACTIVE' && (
            <Button size="sm" variant="outline" onClick={() => onOpenDialog('suspend')}>
              <Ban className="me-2 h-4 w-4" aria-hidden="true" />
              Suspend
            </Button>
          )}
          {account.status === 'PROVISION_FAILED' && (
            <Button size="sm" onClick={() => onOpenDialog('retry')}>
              <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
              Retry provisioning
            </Button>
          )}
          {account.status !== 'TERMINATED' && (
            <Button size="sm" variant="destructive" onClick={() => onOpenDialog('terminate')}>
              <Trash2 className="me-2 h-4 w-4" aria-hidden="true" />
              Terminate
            </Button>
          )}
        </div>
      </div>

      {account.status === 'PROVISION_FAILED' && account.provisioningError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Provisioning failed</AlertTitle>
          <AlertDescription>{account.provisioningError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <DetailRow label="Owner" value={`${account.owner.firstName} ${account.owner.lastName}`} />
            <DetailRow label="Email" value={account.owner.email} />
            <DetailRow label="Plan" value={account.plan.name} />
            <DetailRow label="FTP user" value={account.ftpUser ?? '—'} />
            <DetailRow label="Created" value={formatDate(account.createdAt) ?? '—'} />
            <DetailRow
              label="Suspended"
              value={
                account.suspendedAt
                  ? `${formatDate(account.suspendedAt)}${suspendReason ? ` (${suspendReason})` : ''}`
                  : '—'
              }
            />
            <DetailRow label="Terminated" value={formatDate(account.terminatedAt) ?? '—'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {subscription ? (
              <>
                <DetailRow label="Status" value={subscription.status ?? '—'} />
                <DetailRow
                  label="Current period end"
                  value={formatDate(subscription.currentPeriodEnd) ?? '—'}
                />
                <DetailRow
                  label="Cancel at period end"
                  value={subscription.cancelAtPeriodEnd ? 'Yes' : 'No'}
                />
              </>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">
                No Stripe subscription linked to this account.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage</CardTitle>
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
                {account.domainCount}
                {plan ? ` / ${plan.maxDomains}` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-muted-foreground">Databases</span>
              <span className="font-medium">
                {account.databaseCount}
                {plan ? ` / ${plan.maxDatabases}` : ''}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" aria-hidden="true" />
              Domains
            </CardTitle>
            <CardDescription>{account.domainCount} on this account</CardDescription>
          </CardHeader>
          <CardContent>
            {account.domains.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No domains.</p>
            ) : (
              <ul className="divide-y">
                {account.domains.map((domain) => (
                  <li key={domain.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{domain.domain}</p>
                      <p className="text-xs text-muted-foreground">
                        {domain.isVerified ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-500" aria-hidden="true" />
                            Verified
                          </span>
                        ) : (
                          'Awaiting DNS verification'
                        )}
                        {domain.ssl.expiresAt &&
                          ` · SSL expires ${new Date(domain.ssl.expiresAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <SslBadge status={domain.ssl.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" aria-hidden="true" />
              Databases
            </CardTitle>
            <CardDescription>{account.databaseCount} on this account</CardDescription>
          </CardHeader>
          <CardContent>
            {account.databases.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No databases.</p>
            ) : (
              <ul className="divide-y">
                {account.databases.map((db) => (
                  <li key={db.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="truncate font-mono text-sm">{db.name}</span>
                    {db.isPrimary && <Badge variant="outline">Primary</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
