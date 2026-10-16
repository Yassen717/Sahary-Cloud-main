'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/hosting/StatusBadge';
import type { AdminHostingAccountDTO } from '@/lib/hosting-types';

interface HostingAccountsTableProps {
  accounts: AdminHostingAccountDTO[];
  loading: boolean;
  onSelect: (account: AdminHostingAccountDTO) => void;
}

const percent = (used: number, quota: number) =>
  quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

function MiniUsage({ label, used, quota }: { label: string; used: number; quota: number }) {
  const pct = percent(used, quota);
  return (
    <div className="flex items-center gap-2" title={`${label}: ${used.toFixed(1)} / ${quota.toFixed(1)} GB (${pct}%)`}>
      <span className="w-8 text-[10px] uppercase text-muted-foreground">{label}</span>
      <Progress value={pct} className="h-1.5 w-16" aria-label={`${label} usage`} />
      <span className="w-8 text-[10px] text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function HostingAccountsTable({ accounts, loading, onSelect }: HostingAccountsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Domain</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Usage</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading &&
          Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={`skeleton-${index}`}>
              {Array.from({ length: 7 }).map((_, cellIndex) => (
                <TableCell key={cellIndex}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}

        {!loading && accounts.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
              No hosting accounts match this filter.
            </TableCell>
          </TableRow>
        )}

        {!loading &&
          accounts.map((account) => (
            <TableRow
              key={account.id}
              tabIndex={0}
              className="cursor-pointer"
              onClick={() => onSelect(account)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(account);
                }
              }}
              aria-label={`View hosting account ${account.domain}`}
            >
              <TableCell className="font-medium">{account.domain}</TableCell>
              <TableCell>
                <div className="text-sm">
                  {account.owner.firstName} {account.owner.lastName}
                </div>
                <div className="text-xs text-muted-foreground">{account.owner.email}</div>
              </TableCell>
              <TableCell>{account.plan.name}</TableCell>
              <TableCell>
                <StatusBadge status={account.status} suspendReason={account.suspendReason} />
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <MiniUsage
                    label="Disk"
                    used={account.usage.diskUsedGB}
                    quota={account.usage.diskQuotaGB}
                  />
                  <MiniUsage
                    label="BW"
                    used={account.usage.bandwidthUsedGB}
                    quota={account.usage.bandwidthQuotaGB}
                  />
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(account.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
