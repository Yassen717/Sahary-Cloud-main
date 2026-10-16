'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  Globe,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  deleteFiles,
  getMyAccount,
  listFiles,
  makeDirectory,
  renameFile,
} from '@/lib/hosting-api';
import type {
  FileEntryDTO,
  FileListDTO,
  HostingAccountDTO,
  HostingAccountStatus,
} from '@/lib/hosting-types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { UsageBar } from '@/components/hosting/UsageBar';
import { ConfirmDialog } from '@/components/hosting/files/confirm-dialog';
import { FileEditorDialog } from '@/components/hosting/files/file-editor-dialog';
import { FileTable, type FileRowAction } from '@/components/hosting/files/file-table';
import { FilesBreadcrumbs } from '@/components/hosting/files/files-breadcrumbs';
import { NamePromptDialog } from '@/components/hosting/files/name-prompt-dialog';
import { UploadQueuePanel } from '@/components/hosting/files/upload-queue-panel';
import { useUploadQueue } from '@/components/hosting/files/use-upload-queue';
import {
  isValidEntryName,
  joinPath,
  normalizePath,
  parentPath,
  sortEntries,
  type SortState,
} from '@/components/hosting/files/utils';
import { cn } from '@/lib/utils';

/** Pulls File objects out of a drop, skipping dropped directories. */
function filesFromDataTransfer(dt: DataTransfer): File[] {
  const items = Array.from(dt.items ?? []);
  if (items.length === 0) return Array.from(dt.files);
  const out: File[] = [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry =
      typeof item.webkitGetAsEntry === 'function'
        ? item.webkitGetAsEntry()
        : null;
    if (entry && entry.isDirectory) continue;
    const file = item.getAsFile();
    if (file) out.push(file);
  }
  return out;
}

const READONLY_COPY: Partial<
  Record<HostingAccountStatus, { title: string; body: string }>
> = {
  SUSPENDED: {
    title: 'Account suspended',
    body: 'File changes are disabled while your account is suspended. You can still browse and download files.',
  },
  PROVISIONING: {
    title: 'Account is being provisioned',
    body: 'Your hosting is still being set up. File changes will be enabled once provisioning completes.',
  },
  PROVISION_FAILED: {
    title: 'Provisioning failed',
    body: 'File changes are disabled until your account finishes provisioning.',
  },
  TERMINATED: {
    title: 'Account terminated',
    body: 'Files are read-only on a terminated account.',
  },
};

function TableSkeleton() {
  return (
    <div className="divide-y" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}

function FileManager({
  initialAccount,
}: {
  initialAccount: HostingAccountDTO;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawPath = searchParams.get('path');
  const path = normalizePath(rawPath);

  const [account, setAccount] = useState(initialAccount);
  const [listing, setListing] = useState<FileListDTO | null>(null);
  const [listingLoading, setListingLoading] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileEntryDTO | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<FileEntryDTO[] | null>(
    null,
  );
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const loadSeqRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPathRef = useRef(path);

  const readOnly = account.status !== 'ACTIVE';
  const diskExceeded = account.usage.diskLevel === 'EXCEEDED';
  const uploadsBlocked = readOnly || diskExceeded;

  const buildHref = useCallback(
    (p: string) =>
      p === '/' ? pathname : `${pathname}?path=${encodeURIComponent(p)}`,
    [pathname],
  );
  const navigate = useCallback(
    (p: string) => {
      if (p !== latestPathRef.current) setSelected(new Set());
      router.push(buildHref(p));
    },
    [router, buildHref],
  );

  const showApiError = useCallback(
    (err: unknown, fallback: string) =>
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : fallback,
        variant: 'destructive',
      }),
    [toast],
  );

  const loadListing = useCallback(
    async (targetPath: string, opts?: { silent?: boolean }) => {
      const seq = ++loadSeqRef.current;
      if (!opts?.silent) {
        setListingLoading(true);
        setListingError(null);
      }
      try {
        const data = await listFiles(targetPath);
        if (loadSeqRef.current !== seq) return;
        setListing(data);
        setListingError(null);
        // Drop selections whose entries disappeared.
        setSelected((prev) => {
          if (prev.size === 0) return prev;
          const paths = new Set(data.entries.map((e) => e.path));
          const next = new Set([...prev].filter((p) => paths.has(p)));
          return next.size === prev.size ? prev : next;
        });
        if (data.path !== targetPath) {
          // The backend normalized the path differently — sync the URL.
          router.replace(buildHref(data.path));
        }
      } catch (err) {
        if (loadSeqRef.current !== seq) return;
        // Silent refreshes (after uploads/edits) keep the current listing —
        // the next explicit load surfaces errors to the user.
        if (opts?.silent) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load files';
        setListing(null);
        setListingError(message);
        toast({
          title: 'Could not load files',
          description: message,
          variant: 'destructive',
        });
      } finally {
        if (loadSeqRef.current === seq) {
          setListingLoading(false);
        }
      }
    },
    [buildHref, router, toast],
  );

  // Debounced silent refresh used after uploads/saves.
  const refreshSoon = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void loadListing(latestPathRef.current, { silent: true });
      // Keep the quota bar fresh too.
      void getMyAccount()
        .then((acc) => {
          if (acc) setAccount(acc);
        })
        .catch(() => {});
    }, 400);
  }, [loadListing]);

  useEffect(
    () => () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    },
    [],
  );

  const queue = useUploadQueue({ onFileUploaded: refreshSoon });

  // Keep the URL tidy: replace weird ?path values with their normalized form.
  useEffect(() => {
    if (rawPath !== null && rawPath !== path) {
      router.replace(buildHref(path));
    }
  }, [rawPath, path, router, buildHref]);

  // (Re)load the listing whenever the URL path changes. Selections are
  // pruned by loadListing when entries disappear (paths differ per folder).
  useEffect(() => {
    latestPathRef.current = path;
    void loadListing(path);
  }, [path, loadListing]);

  const sortedEntries = useMemo(
    () => sortEntries(listing?.entries ?? [], sort),
    [listing, sort],
  );
  // While navigating, don't show the previous folder's contents.
  const showingStale = listing !== null && listing.path !== path;
  const viewListing = showingStale ? null : listing;

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0 || uploadsBlocked) return;
      const added = queue.enqueue(files, path);
      if (added < files.length) {
        toast({
          title: 'Some files were skipped',
          description:
            'Files already in the upload queue were not added again.',
        });
      }
    },
    [path, queue, toast, uploadsBlocked],
  );

  /* Drag & drop over the whole manager surface. Drops are always swallowed
     (even when uploads are blocked) so the browser never navigates to the
     dropped file — the "not allowed" cursor communicates read-only mode. */
  const hasFiles = (e: React.DragEvent) =>
    e.dataTransfer.types.includes('Files');

  const onDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (uploadsBlocked) return;
    dragDepthRef.current += 1;
    setDragActive(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = uploadsBlocked ? 'none' : 'copy';
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e) || uploadsBlocked) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (uploadsBlocked) return;
    addFiles(filesFromDataTransfer(e.dataTransfer));
  };

  const toggleSelect = useCallback((entry: FileEntryDTO, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(entry.path);
      else next.delete(entry.path);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelected(
        checked ? new Set(sortedEntries.map((e) => e.path)) : new Set(),
      );
    },
    [sortedEntries],
  );

  const onRowAction = useCallback((entry: FileEntryDTO, action: FileRowAction) => {
    if (action === 'rename') setRenameTarget(entry);
    else if (action === 'edit') setEditorPath(entry.path);
    else setDeleteTargets([entry]);
  }, []);

  const submitNewFolder = async (name: string) => {
    setActionBusy(true);
    try {
      await makeDirectory(path, name);
      toast({ title: 'Folder created', description: name });
      setNewFolderOpen(false);
      refreshSoon();
    } catch (err) {
      showApiError(err, 'Failed to create the folder');
    } finally {
      setActionBusy(false);
    }
  };

  const submitRename = async (name: string) => {
    if (!renameTarget) return;
    const target = renameTarget;
    const to = joinPath(parentPath(target.path) ?? '/', name);
    setActionBusy(true);
    try {
      await renameFile(target.path, to);
      toast({ title: 'Renamed', description: `${target.name} → ${name}` });
      setRenameTarget(null);
      setSelected((prev) => {
        if (!prev.has(target.path)) return prev;
        const next = new Set(prev);
        next.delete(target.path);
        return next;
      });
      refreshSoon();
    } catch (err) {
      showApiError(err, `Failed to rename ${target.name}`);
    } finally {
      setActionBusy(false);
    }
  };

  const confirmDelete = async () => {
    const targets = deleteTargets;
    if (!targets || targets.length === 0) return;
    setActionBusy(true);
    try {
      const res = await deleteFiles(targets.map((t) => t.path));
      toast({
        title: 'Deleted',
        description: `${res.deleted} item${res.deleted === 1 ? '' : 's'} removed.`,
      });
      setDeleteTargets(null);
      setSelected(new Set());
      refreshSoon();
    } catch (err) {
      showApiError(err, 'Failed to delete');
    } finally {
      setActionBusy(false);
    }
  };

  const readonlyCopy = READONLY_COPY[account.status] ?? {
    title: 'Files are read-only',
    body: 'File changes are disabled because your account is not active. You can still browse and download files.',
  };
  const selectedEntries = sortedEntries.filter((e) => selected.has(e.path));

  return (
    <div
      className="relative space-y-4"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragActive ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10"
          aria-hidden="true"
        >
          <p className="rounded-md bg-background/90 px-4 py-2 text-sm font-medium shadow-xs">
            Drop files to upload them here
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderOpen className="h-6 w-6" aria-hidden="true" />
            File Manager
          </h1>
          <p className="mt-1 text-muted-foreground">
            Browse and manage the files served at{' '}
            <span className="font-mono">{account.domain}</span>.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={account.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="me-2 h-4 w-4" aria-hidden="true" />
            View site
          </a>
        </Button>
      </div>

      {readOnly ? (
        <Alert>
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          <div className="mb-1 flex items-center gap-2 font-medium leading-none tracking-tight">
            {readonlyCopy.title}
            <StatusBadge
              status={account.status}
              suspendReason={account.suspendReason}
            />
          </div>
          <AlertDescription>{readonlyCopy.body}</AlertDescription>
        </Alert>
      ) : null}

      {diskExceeded ? (
        <Alert variant="destructive">
          <HardDrive className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Disk quota exceeded</AlertTitle>
          <AlertDescription>
            Uploads and file changes are disabled until you delete some files or
            upgrade your plan.
          </AlertDescription>
        </Alert>
      ) : null}

      <UsageBar
        label="Disk usage"
        used={account.usage.diskUsedGB}
        quota={account.usage.diskQuotaGB}
        level={account.usage.diskLevel}
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilesBreadcrumbs path={viewListing?.path ?? path} onNavigate={navigate} />
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {selected.size > 0 ? (
            <>
              <span
                className="text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {selected.size} selected
              </span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={readOnly || actionBusy}
                onClick={() => setDeleteTargets(selectedEntries)}
              >
                <Trash2 className="me-2 h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Clear selection"
                onClick={() => setSelected(new Set())}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          ) : null}
          <span
            title={
              uploadsBlocked
                ? 'Uploads are disabled for this account'
                : undefined
            }
            className="inline-flex"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadsBlocked}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="me-2 h-4 w-4" aria-hidden="true" />
              Upload
            </Button>
          </span>
          <span
            title={
              uploadsBlocked
                ? 'File changes are disabled for this account'
                : undefined
            }
            className="inline-flex"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadsBlocked}
              onClick={() => setNewFolderOpen(true)}
            >
              <FolderPlus className="me-2 h-4 w-4" aria-hidden="true" />
              New folder
            </Button>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Refresh file list"
            disabled={listingLoading}
            onClick={() => void loadListing(path)}
          >
            <RefreshCw
              className={cn('h-4 w-4', listingLoading && 'animate-spin')}
              aria-hidden="true"
            />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card" aria-busy={listingLoading}>
        {listingError && !showingStale ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <AlertCircle
              className="h-8 w-8 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">{listingError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadListing(path)}
            >
              Try again
            </Button>
          </div>
        ) : showingStale || (listingLoading && !viewListing) ? (
          <TableSkeleton />
        ) : viewListing ? (
          <>
            {viewListing.truncated ? (
              <Alert className="m-4 w-auto">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>
                  This folder is very large — only the first 5,000 entries are
                  shown.
                </AlertDescription>
              </Alert>
            ) : null}
            {sortedEntries.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <FolderOpen
                  className="h-10 w-10 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="font-medium">This folder is empty</p>
                <p className="text-sm text-muted-foreground">
                  {uploadsBlocked
                    ? 'There is nothing here yet.'
                    : 'Drag files anywhere on this page to upload them, or use the Upload button.'}
                </p>
              </div>
            ) : (
              <FileTable
                entries={sortedEntries}
                sort={sort}
                onSortChange={setSort}
                selected={selected}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                onOpen={(entry) => navigate(entry.path)}
                onAction={onRowAction}
                readOnly={readOnly}
              />
            )}
          </>
        ) : null}
      </div>

      <UploadQueuePanel
        tasks={queue.tasks}
        onCancel={queue.cancel}
        onResolveConflict={queue.resolveConflict}
        onClearFinished={queue.clearFinished}
      />

      <NamePromptDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        title="New folder"
        description={`Create a folder in ${path}`}
        label="Folder name"
        submitLabel="Create"
        loading={actionBusy}
        validate={isValidEntryName}
        onSubmit={submitNewFolder}
      />

      <NamePromptDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title={`Rename ${renameTarget?.name ?? ''}`}
        label="New name"
        submitLabel="Rename"
        initialValue={renameTarget?.name ?? ''}
        loading={actionBusy}
        validate={(v) =>
          v === renameTarget?.name
            ? 'Enter a different name.'
            : isValidEntryName(v)
        }
        onSubmit={submitRename}
      />

      <ConfirmDialog
        open={deleteTargets !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets(null);
        }}
        title={
          deleteTargets && deleteTargets.length === 1
            ? `Delete ${deleteTargets[0].name}?`
            : `Delete ${deleteTargets?.length ?? 0} items?`
        }
        description={
          <>
            <p>This cannot be undone.</p>
            {deleteTargets && deleteTargets.length > 1 ? (
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto ps-5 font-mono text-xs">
                {deleteTargets.slice(0, 8).map((t) => (
                  <li key={t.path} className="truncate">
                    {t.name}
                  </li>
                ))}
                {deleteTargets.length > 8 ? (
                  <li>…and {deleteTargets.length - 8} more</li>
                ) : null}
              </ul>
            ) : null}
          </>
        }
        confirmLabel="Delete"
        destructive
        loading={actionBusy}
        onConfirm={confirmDelete}
      />

      <FileEditorDialog
        path={editorPath}
        onOpenChange={(open) => {
          if (!open) setEditorPath(null);
        }}
        onSaved={() => refreshSoon()}
      />
    </div>
  );
}

function FileManagerGate() {
  const { toast } = useToast();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [account, setAccount] = useState<HostingAccountDTO | null>(null);

  const loadAccount = useCallback(async () => {
    try {
      const acc = await getMyAccount();
      setAccount(acc);
      setState('ready');
    } catch (err) {
      setState('error');
      toast({
        title: 'Error',
        description:
          err instanceof Error
            ? err.message
            : 'Failed to load your hosting account',
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  if (state === 'loading') {
    return (
      <div
        className="flex min-h-[40vh] items-center justify-center"
        role="status"
      >
        <Loader2
          className="h-8 w-8 animate-spin text-primary"
          aria-hidden="true"
        />
        <span className="sr-only">Loading file manager…</span>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
            Could not load your hosting account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setState('loading');
              void loadAccount();
            }}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!account) {
    return (
      <div className="max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-5 w-5" aria-hidden="true" />
              File Manager
            </CardTitle>
            <CardDescription>
              You don&apos;t have a hosting account yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Hosting accounts are created when you subscribe to a plan. Your
              files will appear here once your site is provisioned.
            </p>
            <Button asChild>
              <Link href="/pricing">Choose a plan</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <FileManager key={account.id} initialAccount={account} />;
}

export default function HostingFilesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2
            className="h-8 w-8 animate-spin text-primary"
            aria-hidden="true"
          />
        </div>
      }
    >
      <FileManagerGate />
    </Suspense>
  );
}
