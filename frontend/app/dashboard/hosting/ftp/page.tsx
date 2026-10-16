'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Download,
  FolderSync,
  Globe,
  Info,
  KeyRound,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFtp, getMyAccount, resetFtpPassword } from '@/lib/hosting-api';
import type {
  HostingAccountDTO,
  HostingCredentialRevealDTO,
  HostingFtpDTO,
} from '@/lib/hosting-types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/hosting/StatusBadge';
import { ConfirmDialog } from '@/components/hosting/files/confirm-dialog';
import { CopyField } from '@/components/hosting/files/copy-field';
import { CredentialRevealDialog } from '@/components/hosting/files/credential-reveal-dialog';
import { cn } from '@/lib/utils';

const XML_ENTITIES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => XML_ENTITIES[c] ?? c);
}

/**
 * FileZilla "Export Site Manager entries" format. Protocol 0 = FTP,
 * Type 0 = default server type, Logontype 1 = ask for password on connect
 * (the password is never exported).
 */
function buildFileZillaXml(ftp: HostingFtpDTO, siteName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<FileZilla3>
  <Servers>
    <Server>
      <Host>${escapeXml(ftp.host)}</Host>
      <Port>${ftp.port}</Port>
      <Protocol>0</Protocol>
      <Type>0</Type>
      <User>${escapeXml(ftp.username ?? '')}</User>
      <Logontype>1</Logontype>
      <TimezoneOffset>0</TimezoneOffset>
      <PasvMode>MODE_PASSIVE</PasvMode>
      <MaximumMultipleConnections>0</MaximumMultipleConnections>
      <EncodingType>Auto</EncodingType>
      <BypassProxy>0</BypassProxy>
      <Name>${escapeXml(siteName)}</Name>
      <Comments />
      <LocalDir />
      <RemoteDir />
      <SyncBrowsing>0</SyncBrowsing>
    </Server>
  </Servers>
</FileZilla3>
`;
}

function downloadXml(xml: string, filename: string) {
  const blob = new Blob([xml], { type: 'text/xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function NoAccountCard() {
  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-5 w-5" aria-hidden="true" />
            FTP Access
          </CardTitle>
          <CardDescription>
            You don&apos;t have a hosting account yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Hosting accounts are created when you subscribe to a plan. FTP
            credentials will appear here once your site is provisioned.
          </p>
          <Button asChild>
            <Link href="/pricing">Choose a plan</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div
      className="max-w-3xl space-y-6"
      role="status"
      aria-label="Loading FTP details"
    >
      <Skeleton className="h-8 w-56" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

interface FtpViewProps {
  account: HostingAccountDTO;
  initialData: HostingFtpDTO;
}

function FtpView({ account, initialData }: FtpViewProps) {
  const { toast } = useToast();
  const [data, setData] = useState(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [reveal, setReveal] = useState<HostingCredentialRevealDTO | null>(null);

  const readOnly = account.status !== 'ACTIVE';

  const showApiError = useCallback(
    (err: unknown, fallback: string) =>
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : fallback,
        variant: 'destructive',
      }),
    [toast],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await getFtp());
    } catch (err) {
      showApiError(err, 'Failed to refresh FTP details');
    } finally {
      setRefreshing(false);
    }
  }, [showApiError]);

  const confirmReset = async () => {
    setResetting(true);
    try {
      const credentials = await resetFtpPassword();
      setResetConfirmOpen(false);
      setReveal(credentials);
      await refresh();
    } catch (err) {
      showApiError(err, 'Failed to reset the FTP password');
    } finally {
      setResetting(false);
    }
  };

  const exportFileZilla = () => {
    const xml = buildFileZillaXml(data, `Sahary Cloud — ${account.domain}`);
    downloadXml(xml, 'sahary-ftp.xml');
    toast({
      title: 'FileZilla config downloaded',
      description:
        'Import sahary-ftp.xml in FileZilla via File → Site Manager → Import.',
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderSync className="h-6 w-6" aria-hidden="true" />
            FTP Access
          </h1>
          <p className="mt-1 text-muted-foreground">
            Upload and manage files with any FTP client.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="Refresh FTP details"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw
            className={cn('h-4 w-4', refreshing && 'animate-spin')}
            aria-hidden="true"
          />
        </Button>
      </div>

      {readOnly ? (
        <Alert>
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          <div className="mb-1 flex items-center gap-2 font-medium leading-none tracking-tight">
            Your account is not active
            <StatusBadge
              status={account.status}
              suspendReason={account.suspendReason}
            />
          </div>
          <AlertDescription>
            FTP logins and password resets are disabled until your account is
            active again.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">FTP credentials</CardTitle>
          <CardDescription>
            Use these details in your FTP client to connect to your site&apos;s
            document root.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <CopyField label="Host" value={data.host} />
            <CopyField label="Port" value={String(data.port)} />
          </div>
          <CopyField
            label="Username"
            value={data.username}
            emptyHint="The FTP user is not provisioned yet."
          />
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              <span className="font-medium">Password:</span>{' '}
              <span className="text-muted-foreground">
                {data.passwordSet
                  ? 'Set'
                  : 'Not set yet — reset to generate one'}
              </span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={readOnly || !data.username || resetting}
              onClick={() => setResetConfirmOpen(true)}
            >
              <KeyRound className="me-2 h-4 w-4" aria-hidden="true" />
              Reset password
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!data.username}
              onClick={exportFileZilla}
            >
              <Download className="me-2 h-4 w-4" aria-hidden="true" />
              Download FileZilla config
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" aria-hidden="true" />
            Connecting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 ps-5 text-sm text-muted-foreground">
            <li>
              Install any FTP client such as FileZilla (the button above exports
              a ready-to-import site entry).
            </li>
            <li>
              Enter the host, port and username shown above. If you have never
              set a password, use <em>Reset password</em> first — the new
              password is shown only once.
            </li>
            <li>Use passive (PASV) transfer mode — it is the default in most clients.</li>
            <li>
              FTP does not encrypt credentials or data. Prefer the web file
              manager for sensitive changes.
            </li>
          </ol>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset the FTP password?"
        description="A new password will be generated for your FTP user. All existing FTP sessions that use the old password will stop working."
        confirmLabel="Reset password"
        loading={resetting}
        onConfirm={confirmReset}
      />

      <CredentialRevealDialog
        open={reveal !== null}
        onOpenChange={(open) => {
          if (!open) setReveal(null);
        }}
        title="New FTP password"
        credentials={reveal}
      />
    </div>
  );
}

export default function HostingFtpPage() {
  const { toast } = useToast();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [account, setAccount] = useState<HostingAccountDTO | null>(null);
  const [data, setData] = useState<HostingFtpDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const acc = await getMyAccount();
      setAccount(acc);
      if (!acc) {
        setState('ready');
        return;
      }
      const ftp = await getFtp();
      setData(ftp);
      setState('ready');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load FTP details';
      setLoadError(message);
      setState('error');
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') return <LoadingSkeleton />;

  if (state === 'error') {
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle
              className="h-5 w-5 text-destructive"
              aria-hidden="true"
            />
            Could not load FTP details
          </CardTitle>
          {loadError ? <CardDescription>{loadError}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setState('loading');
              void load();
            }}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!account) return <NoAccountCard />;

  if (data && !data.enabled) {
    return (
      <div className="max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderSync className="h-5 w-5" aria-hidden="true" />
              FTP Access
            </CardTitle>
            <CardDescription>
              FTP is not enabled on this server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This server does not run an FTP service. Use the web file manager
              to upload and manage your files instead.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/dashboard/hosting/files">Open file manager</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return <LoadingSkeleton />;

  return <FtpView account={account} initialData={data} />;
}
