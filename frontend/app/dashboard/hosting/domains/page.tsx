'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getMyAccount,
  addDomain,
  verifyDomain,
  removeDomain,
} from '@/lib/hosting-api';
import type { HostingAccountDTO } from '@/lib/hosting-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Globe,
  CheckCircle,
  Clock,
  Loader2,
  Trash2,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Info,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export default function HostingDomainsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [account, setAccount] = useState<HostingAccountDTO | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    try {
      const data = await getMyAccount();
      setAccount(data);
    } catch (err) {
      toast({ title: 'Error', description: errorMessage(err, 'Failed to load hosting account'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const refreshAccount = async () => {
    setRefreshing(true);
    await loadAccount();
    setRefreshing(false);
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    try {
      setAdding(true);
      await addDomain(newDomain.trim().toLowerCase());
      toast({ title: 'Domain added', description: 'Add the DNS TXT record below to verify ownership.' });
      setNewDomain('');
      await refreshAccount();
    } catch (err) {
      toast({ title: 'Error', description: errorMessage(err, 'Failed to add domain'), variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (domainId: string) => {
    try {
      setVerifying(domainId);
      const domain = await verifyDomain(domainId);
      if (domain.isVerified) {
        toast({ title: 'Domain verified!', description: 'Your domain is now active.' });
      } else {
        toast({ title: 'Not yet verified', description: 'DNS record not found. Please wait for propagation and try again.', variant: 'destructive' });
      }
      await refreshAccount();
    } catch (err) {
      toast({ title: 'Verification failed', description: errorMessage(err, 'DNS record not found'), variant: 'destructive' });
    } finally {
      setVerifying(null);
    }
  };

  const handleRemove = async (domainId: string) => {
    try {
      setRemoving(domainId);
      await removeDomain(domainId);
      toast({ title: 'Domain removed' });
      await refreshAccount();
    } catch (err) {
      toast({ title: 'Error', description: errorMessage(err, 'Failed to remove domain'), variant: 'destructive' });
    } finally {
      setRemoving(null);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'The clipboard is not available in this browser.', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <h1 className="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Domain Management
            </h1>
            <CardDescription>You don&apos;t have an active hosting account yet.</CardDescription>
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
      </div>
    );
  }

  const customDomains = account.domains ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Globe className="h-6 w-6" />
          Domain Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your hosting subdomain and custom domains.
        </p>
        {refreshing && <p className="text-xs text-muted-foreground mt-1" role="status">Refreshing…</p>}
      </div>

      {/* Assigned subdomain */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Subdomain</CardTitle>
          <CardDescription>Auto-assigned when your hosting account was created.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono font-medium">{account.domain}</span>
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle className="h-3 w-3 mr-1" />
              Active
            </Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Copy subdomain"
            onClick={() => copyToClipboard(account.domain, 'subdomain')}
          >
            {copied === 'subdomain' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>

      {/* Add custom domain */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Custom Domain</CardTitle>
          <CardDescription>
            Point your domain to our servers and verify ownership via a DNS TXT record.
            Your plan allows up to <strong>{account.plan.maxDomains}</strong> custom domain(s).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddDomain} className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="new-domain" className="sr-only">Domain</Label>
              <Input
                id="new-domain"
                placeholder="yourdomain.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                disabled={adding}
              />
            </div>
            <Button type="submit" disabled={adding || !newDomain.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-1">Add</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Custom domains list */}
      {customDomains.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custom Domains</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customDomains.map((d) => {
              const verification = d.verification ?? (d.verifyToken
                ? { recordType: 'TXT' as const, host: d.domain, value: `sahary-verify=${d.verifyToken}` }
                : null);
              return (
              <div key={d.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-mono font-medium truncate">{d.domain}</span>
                    {d.isVerified ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 shrink-0">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!d.isVerified && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleVerify(d.id)}
                        disabled={verifying === d.id}
                      >
                        {verifying === d.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1">Verify</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${d.domain}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemove(d.id)}
                      disabled={removing === d.id}
                    >
                      {removing === d.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* DNS instructions for unverified domains */}
                {!d.isVerified && verification && (
                  <div className="rounded-md bg-muted p-3 space-y-2 text-sm">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Info className="h-4 w-4 text-blue-500" />
                      DNS Verification Instructions
                    </div>
                    <p className="text-muted-foreground">
                      Add the following TXT record to your domain&apos;s DNS settings, then click{' '}
                      <strong>Verify</strong>.
                    </p>
                    <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 font-mono text-xs bg-background rounded-sm border p-2">
                      <span className="text-muted-foreground">Type</span>
                      <span className="col-span-2">{verification.recordType}</span>

                      <span className="text-muted-foreground">Host</span>
                      <span className="truncate">@ (or {verification.host})</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        aria-label={`Copy host for ${d.domain}`}
                        onClick={() => copyToClipboard(verification.host, `host-${d.id}`)}
                      >
                        {copied === `host-${d.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>

                      <span className="text-muted-foreground">Value</span>
                      <span className="truncate">{verification.value}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        aria-label={`Copy TXT value for ${d.domain}`}
                        onClick={() => copyToClipboard(verification.value, `val-${d.id}`)}
                      >
                        {copied === `val-${d.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      DNS changes can take up to 48 hours to propagate worldwide.
                    </p>

                    <div className="mt-2 pt-2 border-t space-y-1">
                      <p className="font-medium">DNS Pointing Instructions</p>
                      <p className="text-muted-foreground">
                        To point your domain to our servers, also add an <strong>A record</strong>:
                      </p>
                      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 font-mono text-xs bg-background rounded-sm border p-2">
                        <span className="text-muted-foreground">Type</span>
                        <span className="col-span-2">A</span>

                        <span className="text-muted-foreground">Host</span>
                        <span className="col-span-2">@ (or www)</span>

                        <span className="text-muted-foreground">Value</span>
                        <span className="truncate">
                          {process.env.NEXT_PUBLIC_SERVER_IP || 'contact support for server IP'}
                        </span>
                        {process.env.NEXT_PUBLIC_SERVER_IP && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5"
                            aria-label={`Copy server IP for ${d.domain}`}
                            onClick={() => copyToClipboard(process.env.NEXT_PUBLIC_SERVER_IP!, `ip-${d.id}`)}
                          >
                            {copied === `ip-${d.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
