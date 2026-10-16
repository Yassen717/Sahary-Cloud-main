'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getMyAccount,
  listDomains,
  addDomain,
  verifyDomain,
  removeDomain,
  issueDomainSsl,
} from '@/lib/hosting-api';
import { ApiError } from '@/lib/api';
import type { HostingAccountDTO, HostingDomainDTO } from '@/lib/hosting-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle,
  Clock,
  Globe,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CopyButton } from '@/components/hosting/CopyButton';
import { SslBadge } from '@/components/hosting/SslBadge';
import { StatusBadge } from '@/components/hosting/StatusBadge';
import { UsageBar } from '@/components/hosting/UsageBar';
import { usePolling } from '@/components/hosting/usePolling';

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const SERVER_IP = process.env.NEXT_PUBLIC_SERVER_IP;

type VerificationRecord = NonNullable<HostingDomainDTO['verification']>;

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

function verificationFor(d: HostingDomainDTO): VerificationRecord | null {
  if (d.verification) return d.verification;
  // Legacy shape: raw token while unverified.
  if (d.verifyToken) {
    return { recordType: 'TXT', host: d.domain, value: `sahary-verify=${d.verifyToken}` };
  }
  return null;
}

export default function HostingDomainsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [account, setAccount] = useState<HostingAccountDTO | null>(null);
  const [domains, setDomains] = useState<HostingDomainDTO[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [dnsDialogId, setDnsDialogId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<HostingDomainDTO | null>(null);
  const [liveMessage, setLiveMessage] = useState('');

  const loadAccount = useCallback(async () => {
    try {
      const data = await getMyAccount();
      setAccount(data);
      setDomains(data?.domains ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to load your hosting account.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the async load resolves
    void loadAccount();
  }, [loadAccount]);

  const refreshDomains = useCallback(async () => {
    setDomains(await listDomains());
  }, []);

  // While any certificate is pending, re-check the domain list every 5s
  // (up to 2 min) so the SSL badge flips to ACTIVE/FAILED on its own.
  const hasPendingSsl = domains.some((d) => d.isVerified && d.ssl.status === 'PENDING');
  usePolling(hasPendingSsl, refreshDomains, { intervalMs: 5000, timeoutMs: 120_000 });

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    try {
      setAdding(true);
      await addDomain(newDomain.trim().toLowerCase());
      setNewDomain('');
      await refreshDomains();
      setLiveMessage('Domain added. Add the DNS TXT record to verify ownership.');
      toast({ title: 'Domain added', description: 'Add the DNS TXT record to verify ownership.' });
    } catch (err) {
      toast({ title: 'Could not add domain', description: errorMessage(err, 'Failed to add domain'), variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (d: HostingDomainDTO) => {
    try {
      setVerifyingId(d.id);
      const updated = await verifyDomain(d.id);
      if (updated.isVerified) {
        setDnsDialogId(null);
        setLiveMessage(`${d.domain} verified.`);
        toast({ title: 'Domain verified!', description: `${d.domain} is now active.` });
      } else {
        toast({
          title: 'Not verified yet',
          description: "We couldn't find the TXT record. DNS changes can take up to 24 hours to propagate.",
        });
      }
      await refreshDomains();
    } catch (err) {
      // The API answers 400 while the TXT record is still missing.
      if (err instanceof ApiError && err.status === 400) {
        toast({
          title: 'Not verified yet',
          description: "We couldn't find the TXT record. DNS changes can take up to 24 hours to propagate — try again soon.",
        });
      } else {
        toast({ title: 'Verification failed', description: errorMessage(err, 'Please try again.'), variant: 'destructive' });
      }
    } finally {
      setVerifyingId(null);
    }
  };

  const handleIssueSsl = async (d: HostingDomainDTO) => {
    try {
      setIssuingId(d.id);
      await issueDomainSsl(d.id);
      setLiveMessage(`Certificate requested for ${d.domain}.`);
      toast({ title: 'Certificate requested', description: `Issuing an SSL certificate for ${d.domain} — this takes a moment.` });
      await refreshDomains();
    } catch (err) {
      toast({ title: 'Could not issue certificate', description: errorMessage(err, 'Please try again.'), variant: 'destructive' });
    } finally {
      setIssuingId(null);
    }
  };

  const handleRemove = async (d: HostingDomainDTO) => {
    try {
      setRemovingId(d.id);
      await removeDomain(d.id);
      setLiveMessage(`${d.domain} removed.`);
      toast({ title: 'Domain removed' });
      await refreshDomains();
    } catch (err) {
      toast({ title: 'Could not remove domain', description: errorMessage(err, 'Please try again.'), variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Couldn&apos;t load domains</CardTitle>
          <CardDescription>{loadError}</CardDescription>
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
            Domain Management
          </CardTitle>
          <CardDescription>You don&apos;t have a hosting account yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Hosting accounts are created when you subscribe to a plan.
          </p>
          <Button asChild>
            <Link href="/pricing">Choose a plan</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const readOnly = account.status !== 'ACTIVE';
  const maxDomains = account.plan.maxDomains;
  const atLimit = domains.length >= maxDomains;
  const sslExpiryRaw = account.ssl.expiresAt ? new Date(account.ssl.expiresAt) : null;
  const sslExpiry = sslExpiryRaw && !Number.isNaN(sslExpiryRaw.getTime()) ? sslExpiryRaw : null;
  // Resolved live from the refreshed list so the dialog reflects new state.
  const dnsDialogFor = dnsDialogId
    ? (domains.find((d) => d.id === dnsDialogId) ?? null)
    : null;
  const dnsVerification = dnsDialogFor ? verificationFor(dnsDialogFor) : null;

  return (
    <div className="space-y-6">
      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-6 w-6" />
            Domains
          </h1>
          <p className="text-muted-foreground mt-1">
            Your subdomain and custom domains.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setRefreshing(true); void loadAccount(); }}
          disabled={refreshing}
          aria-label="Refresh domains"
        >
          <RefreshCw className={`h-3.5 w-3.5 me-1 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {readOnly && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2">
            Read-only — account is <StatusBadge status={account.status} suspendReason={account.suspendReason} />
          </AlertTitle>
          <AlertDescription>
            Domain changes are disabled until your account is active again.
          </AlertDescription>
        </Alert>
      )}

      {hasPendingSsl && (
        <p className="text-xs text-muted-foreground" role="status">
          Checking certificate status every few seconds…
        </p>
      )}

      {/* Primary subdomain */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Subdomain</CardTitle>
          <CardDescription>Auto-assigned when your hosting account was created.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-mono font-medium truncate">{account.domain}</span>
              <SslBadge status={account.ssl.enabled ? 'ACTIVE' : 'NONE'} />
            </div>
            <div className="flex items-center gap-1">
              <CopyButton value={account.domain} label="subdomain" />
              <Button size="sm" variant="ghost" asChild>
                <a href={account.url} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${account.domain}`}>
                  Visit
                </a>
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {account.ssl.enabled
              ? `Served over HTTPS${sslExpiry ? ` — certificate expires ${sslExpiry.toLocaleDateString()}` : ''}.`
              : 'Served over HTTP — HTTPS is not configured for platform subdomains on this server.'}
          </p>
        </CardContent>
      </Card>

      {/* Limit meter + add domain */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Custom Domain</CardTitle>
          <CardDescription>
            Verify ownership with a DNS TXT record, then point the domain at our
            servers. We&apos;ll issue its SSL certificate for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {maxDomains > 0 ? (
            <UsageBar label="Custom domains" used={domains.length} quota={maxDomains} unit="domains" />
          ) : (
            <p className="text-sm text-muted-foreground">
              The {account.plan.name} plan doesn&apos;t include custom domains.
            </p>
          )}

          {atLimit && maxDomains > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Domain limit reached — remove a domain or{' '}
              <Link className="underline" href="/dashboard/subscription">upgrade your plan</Link>.
            </p>
          )}

          <form onSubmit={handleAddDomain} className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="new-domain" className="sr-only">Domain</Label>
              <Input
                id="new-domain"
                placeholder="yourdomain.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                disabled={adding || readOnly || atLimit}
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={adding || readOnly || atLimit || !newDomain.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ms-1">Add</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Custom domains */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Domains</CardTitle>
          {domains.length > 0 && (
            <CardDescription>
              {domains.filter((d) => d.isVerified).length} of {domains.length} verified
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No custom domains yet — add one above to use your own domain.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>SSL</TableHead>
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono font-medium">
                      <span className="flex items-center gap-2">
                        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate max-w-40 sm:max-w-56">{d.domain}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      {d.isVerified ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="h-3 w-3 me-1" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                          <Clock className="h-3 w-3 me-1" />
                          Pending DNS
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!d.isVerified ? (
                        <span className="text-xs text-muted-foreground">Verify first</span>
                      ) : (
                        <div className="space-y-1">
                          <span className="flex items-center gap-1.5">
                            <SslBadge status={d.ssl.status} />
                            {d.ssl.status === 'PENDING' && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Issuing" />
                            )}
                          </span>
                          {d.ssl.status === 'ACTIVE' && shortDate(d.ssl.expiresAt) && (
                            <p className="text-xs text-muted-foreground">
                              expires {shortDate(d.ssl.expiresAt)}
                            </p>
                          )}
                          {d.ssl.status === 'FAILED' && d.ssl.lastError && (
                            <p className="text-xs text-destructive max-w-48" title={d.ssl.lastError}>
                              {d.ssl.lastError}
                            </p>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {!d.isVerified && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDnsDialogId(d.id)}
                            >
                              DNS setup
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleVerify(d)}
                              disabled={readOnly || verifyingId === d.id}
                            >
                              {verifyingId === d.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                              <span className="ms-1">Verify</span>
                            </Button>
                          </>
                        )}
                        {d.isVerified && (d.ssl.status === 'NONE' || d.ssl.status === 'FAILED') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleIssueSsl(d)}
                            disabled={readOnly || issuingId === d.id}
                          >
                            {issuingId === d.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5" />
                            )}
                            <span className="ms-1">Issue certificate</span>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${d.domain}`}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRemoveTarget(d)}
                          disabled={readOnly || removingId === d.id}
                        >
                          {removingId === d.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* DNS instructions dialog */}
      <Dialog open={dnsDialogFor !== null} onOpenChange={(open) => { if (!open) setDnsDialogId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono text-base break-all">
              DNS setup for {dnsDialogFor?.domain}
            </DialogTitle>
            <DialogDescription>
              Add this TXT record at your DNS provider or registrar, then press
              Verify.
            </DialogDescription>
          </DialogHeader>

          {dnsVerification ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/50 p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-muted-foreground">Type</span>
                  <span className="font-mono">{dnsVerification.recordType}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-muted-foreground">Host</span>
                  <span className="font-mono truncate">{dnsVerification.host}</span>
                  <CopyButton value={dnsVerification.host} label="host" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-muted-foreground">Value</span>
                  <span className="font-mono truncate">{dnsVerification.value}</span>
                  <CopyButton value={dnsVerification.value} label="TXT value" />
                </div>
              </div>

              {SERVER_IP && (
                <div className="rounded-md border p-3 space-y-1.5">
                  <p className="text-sm font-medium">Point the domain at us</p>
                  <p className="text-xs text-muted-foreground">
                    To serve your site on this domain, also add an{' '}
                    <strong>A record</strong> for <code className="font-mono">@</code>{' '}
                    (and optionally <code className="font-mono">www</code>)
                    pointing to:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm">{SERVER_IP}</code>
                    <CopyButton value={SERVER_IP} label="server IP" />
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                DNS changes can take up to 24 hours to propagate. If verification
                fails, wait a bit and try again.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This domain doesn&apos;t need a verification record.
            </p>
          )}

          <DialogFooter>
            {dnsDialogFor && !dnsDialogFor.isVerified && (
              <Button
                onClick={() => void handleVerify(dnsDialogFor)}
                disabled={readOnly || verifyingId === dnsDialogFor.id}
              >
                {verifyingId === dnsDialogFor.id && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin me-1" />
                )}
                Verify now
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-all">
              Remove {removeTarget?.domain}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The domain stops serving your site and its SSL certificate is
              deleted. Your site files are not touched. You can re-add the
              domain later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (removeTarget) void handleRemove(removeTarget); }}
            >
              Remove domain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
