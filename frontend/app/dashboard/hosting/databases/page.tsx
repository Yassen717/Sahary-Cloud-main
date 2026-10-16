'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Database,
  Globe,
  Info,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  createDatabase,
  deleteDatabase,
  getDatabases,
  getMyAccount,
  resetDatabasePassword,
} from '@/lib/hosting-api';
import type {
  HostingAccountDTO,
  HostingCredentialRevealDTO,
  HostingDatabaseDTO,
  HostingDatabasesDTO,
} from '@/lib/hosting-types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/hosting/StatusBadge';
import { ConfirmDialog } from '@/components/hosting/files/confirm-dialog';
import { CopyField } from '@/components/hosting/files/copy-field';
import { CredentialRevealDialog } from '@/components/hosting/files/credential-reveal-dialog';
import { formatDate } from '@/components/hosting/files/utils';
import { cn } from '@/lib/utils';

const DB_LABEL_PATTERN = /^[a-z0-9]{1,20}$/;

function NoAccountCard() {
  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-5 w-5" aria-hidden="true" />
            Databases
          </CardTitle>
          <CardDescription>
            You don&apos;t have a hosting account yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Hosting accounts are created when you subscribe to a plan. MySQL
            databases will be available here once your site is provisioned.
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
    <div className="max-w-3xl space-y-6" role="status" aria-label="Loading databases">
      <Skeleton className="h-8 w-56" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

interface DatabasesViewProps {
  account: HostingAccountDTO;
  initialData: HostingDatabasesDTO;
}

function DatabasesView({ account, initialData }: DatabasesViewProps) {
  const { toast } = useToast();
  const labelInputId = useId();
  const deleteInputId = useId();

  const [data, setData] = useState(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [label, setLabel] = useState('');
  const [labelError, setLabelError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HostingDatabaseDTO | null>(
    null,
  );
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [reveal, setReveal] = useState<HostingCredentialRevealDTO | null>(null);

  const readOnly = account.status !== 'ACTIVE';
  const atLimit = data.databases.length >= data.limit;
  const trimmedLabel = label.trim();

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
      setData(await getDatabases());
    } catch (err) {
      showApiError(err, 'Failed to refresh databases');
    } finally {
      setRefreshing(false);
    }
  }, [showApiError]);

  const validateLabel = (value: string): string | null => {
    if (!value) return 'Enter a database label.';
    if (!DB_LABEL_PATTERN.test(value)) {
      return 'Use 1–20 characters: lowercase letters a–z and digits 0–9 only.';
    }
    return null;
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateLabel(trimmedLabel);
    if (error) {
      setLabelError(error);
      return;
    }
    setCreating(true);
    try {
      await createDatabase(trimmedLabel);
      toast({ title: 'Database created', description: trimmedLabel });
      setLabel('');
      setLabelError(null);
      await refresh();
    } catch (err) {
      showApiError(err, 'Failed to create the database');
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDatabase(deleteTarget.id);
      toast({ title: 'Database deleted', description: deleteTarget.name });
      setDeleteTarget(null);
      setDeleteConfirmText('');
      await refresh();
    } catch (err) {
      showApiError(err, `Failed to delete ${deleteTarget.name}`);
    } finally {
      setDeleting(false);
    }
  };

  const confirmReset = async () => {
    setResetting(true);
    try {
      const credentials = await resetDatabasePassword();
      setResetConfirmOpen(false);
      setReveal(credentials);
      await refresh();
    } catch (err) {
      showApiError(err, 'Failed to reset the database password');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6" aria-hidden="true" />
            Databases
          </h1>
          <p className="mt-1 text-muted-foreground">
            MySQL databases for{' '}
            <span className="font-mono">{account.domain}</span>.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="Refresh databases"
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
            Database changes are disabled until your account is active again.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection details</CardTitle>
          <CardDescription>
            One MySQL user has access to all databases on this account.
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
            emptyHint="The database user is not provisioned yet."
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your databases</CardTitle>
          <CardDescription>
            {data.databases.length} / {data.limit} databases used
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.databases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No databases yet — create your first one below.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32">Created</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.databases.map((db) => (
                  <TableRow key={db.id}>
                    <TableCell className="font-mono">
                      <span className="inline-flex items-center gap-2">
                        {db.name}
                        {db.isPrimary ? (
                          <Badge variant="secondary">Primary</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(db.createdAt)}
                    </TableCell>
                    <TableCell>
                      {db.isPrimary ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label={`Delete database ${db.name}`}
                          disabled={readOnly}
                          onClick={() => {
                            setDeleteTarget(db);
                            setDeleteConfirmText('');
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <form onSubmit={submitCreate} className="space-y-2">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-52 flex-1 space-y-1">
                <Label htmlFor={labelInputId}>New database label</Label>
                <Input
                  id={labelInputId}
                  value={label}
                  onChange={(e) => {
                    setLabel(e.target.value.toLowerCase());
                    if (labelError) setLabelError(null);
                  }}
                  placeholder="e.g. blog"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={readOnly || creating || atLimit}
                  aria-invalid={labelError ? true : undefined}
                  aria-describedby={
                    labelError ? `${labelInputId}-error` : undefined
                  }
                />
              </div>
              <Button
                type="submit"
                className="mt-6"
                disabled={
                  readOnly ||
                  creating ||
                  atLimit ||
                  trimmedLabel.length === 0
                }
              >
                {creating ? (
                  <Loader2
                    className="me-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Plus className="me-2 h-4 w-4" aria-hidden="true" />
                )}
                Create database
              </Button>
            </div>
            {labelError ? (
              <p id={`${labelInputId}-error`} className="text-sm text-destructive">
                {labelError}
              </p>
            ) : null}
            {atLimit ? (
              <p className="text-sm text-muted-foreground">
                You reached your plan&apos;s database limit. Delete a database
                or upgrade to create more.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                The label is appended to your username to form the database
                name.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" aria-hidden="true" />
            Usage tips
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Connect with any MySQL client. Example:
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
            mysql -h {data.host} -P {data.port} -u{' '}
            {data.username ?? '<username>'} -p{' '}
            {data.databases[0]?.name ?? '<database>'}
          </pre>
          {data.host === 'localhost' || data.host === '127.0.0.1' ? (
            <p>
              Applications running on this server can use{' '}
              <span className="font-mono">localhost</span> as the host.
            </p>
          ) : (
            <p>
              Remote connections use the host shown above; your MySQL user is
              allowed from any host.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!deleting && !open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete database {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              All tables and data in this database will be permanently removed.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={deleteInputId}>
              Type <span className="font-mono">{deleteTarget?.name}</span> to
              confirm
            </Label>
            <Input
              id={deleteInputId}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={deleting}
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                deleting || deleteConfirmText !== deleteTarget?.name
              }
              onClick={confirmDelete}
            >
              {deleting ? (
                <>
                  <Loader2
                    className="me-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Deleting…
                </>
              ) : (
                'Delete database'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset the database password?"
        description="A new password will be generated for your MySQL user. All existing connections that use the old password will stop working."
        confirmLabel="Reset password"
        loading={resetting}
        onConfirm={confirmReset}
      />

      <CredentialRevealDialog
        open={reveal !== null}
        onOpenChange={(open) => {
          if (!open) setReveal(null);
        }}
        title="New database password"
        credentials={reveal}
      />
    </div>
  );
}

export default function HostingDatabasesPage() {
  const { toast } = useToast();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [account, setAccount] = useState<HostingAccountDTO | null>(null);
  const [data, setData] = useState<HostingDatabasesDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const acc = await getMyAccount();
      setAccount(acc);
      if (!acc) {
        setState('ready');
        return;
      }
      const databases = await getDatabases();
      setData(databases);
      setState('ready');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load databases';
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
            Could not load databases
          </CardTitle>
          {loadError ? (
            <CardDescription>{loadError}</CardDescription>
          ) : null}
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
              <Database className="h-5 w-5" aria-hidden="true" />
              Databases
            </CardTitle>
            <CardDescription>
              MySQL is not available on this server yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Database support is not enabled on this server. Your files and
              static site keep working — databases will appear here once the
              feature is enabled.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return <LoadingSkeleton />;

  return <DatabasesView account={account} initialData={data} />;
}
