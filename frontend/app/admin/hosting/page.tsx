'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { adminListAccounts, adminStats } from '@/lib/hosting-api';
import type {
  AdminHostingAccountDTO,
  AdminHostingStatsDTO,
  Paginated,
} from '@/lib/hosting-types';
import { AdminNav } from '@/components/admin/AdminNav';
import { NotAuthorized } from '@/components/admin/NotAuthorized';
import { HostingStatsCards } from '@/components/admin/HostingStatsCards';
import { HostingAccountsTable } from '@/components/admin/HostingAccountsTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, ListChecks, RefreshCw, Search, Server } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'PROVISIONING', label: 'Provisioning' },
  { value: 'PROVISION_FAILED', label: 'Provisioning failed' },
  { value: 'TERMINATED', label: 'Terminated' },
];

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export default function AdminHostingPage() {
  const { toast } = useToast();
  const router = useRouter();

  const [forbidden, setForbidden] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminHostingStatsDTO | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [data, setData] = useState<Paginated<AdminHostingAccountDTO> | null>(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reloadKey, setReloadKey] = useState(0);

  // Latest query params, readable inside the debounce timer without making the
  // debounce effect depend on them (which would reset pagination after every
  // page turn).
  const queryRef = useRef({ search, page });
  useEffect(() => {
    queryRef.current = { search, page };
  });

  // Debounce the search box (matches the users admin page pattern).
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      const current = queryRef.current;
      // A refetch only happens when a query param actually changes — don't
      // show the loading skeleton for a no-op debounce.
      if (next !== current.search || current.page !== 1) {
        setTableLoading(true);
      }
      setSearch(next);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let live = true;
    adminStats()
      .then((result) => {
        if (!live) return;
        setStats(result);
        setStatsError(null);
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(err.message);
        } else {
          setStatsError(errorMessage(err, 'Failed to load hosting statistics'));
        }
      });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let live = true;
    adminListAccounts({
      page,
      limit: PAGE_SIZE,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
    })
      .then((result) => {
        if (!live) return;
        setData(result);
        setTableError(null);
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(err.message);
        } else {
          setTableError(errorMessage(err, 'Failed to load hosting accounts'));
          toast({
            title: 'Error',
            description: errorMessage(err, 'Failed to load hosting accounts'),
            variant: 'destructive',
          });
        }
      })
      .finally(() => {
        if (live) setTableLoading(false);
      });
    return () => {
      live = false;
    };
  }, [page, search, statusFilter, reloadKey, toast]);

  const reload = useCallback(() => {
    setTableLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  if (forbidden) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <AdminNav />
        <NotAuthorized />
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
    setTableLoading(true);
  };

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    setTableLoading(true);
  };

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-primary/10 p-3">
            <Server className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Hosting Administration</h1>
            <p className="text-muted-foreground">Accounts, plans and platform usage</p>
          </div>
        </div>
      </div>

      <AdminNav />

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Overview</h2>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/hosting/plans">
            <ListChecks className="me-2 h-4 w-4" aria-hidden="true" />
            Manage plans
          </Link>
        </Button>
      </div>

      <div className="mb-6">
        {stats ? (
          <HostingStatsCards stats={stats} />
        ) : statsError ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-6">
              <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{statsError}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Hosting accounts</CardTitle>
              <CardDescription>
                {data ? `${data.total} account${data.total === 1 ? '' : 's'}` : 'All customer hosting accounts'}
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search
                  className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search domain or owner…"
                  className="w-full ps-9 sm:w-64"
                  aria-label="Search hosting accounts"
                />
              </div>
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                aria-label="Refresh accounts"
                onClick={reload}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tableError && !tableLoading ? (
            <div className="py-10 text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" aria-hidden="true" />
              <p className="mb-4 text-sm text-muted-foreground">{tableError}</p>
              <Button variant="outline" size="sm" onClick={reload}>
                Try again
              </Button>
            </div>
          ) : (
            <HostingAccountsTable
              accounts={data?.items ?? []}
              loading={tableLoading}
              onSelect={(account) => router.push(`/admin/hosting/${account.id}`)}
            />
          )}

          {data && data.total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Previous page"
                  disabled={page <= 1 || tableLoading}
                  onClick={() => goToPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Next page"
                  disabled={page >= totalPages || tableLoading}
                  onClick={() => goToPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
