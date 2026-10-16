import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Users, DollarSign, HardDrive, Network, ShieldCheck } from 'lucide-react';
import type { AdminHostingStatsDTO } from '@/lib/hosting-types';

interface HostingStatsCardsProps {
  stats: AdminHostingStatsDTO;
}

const gb = (value: number) => `${value.toFixed(1)} GB`;

function QuotaRow({ used, quota }: { used: number; quota: number }) {
  const percent = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="text-2xl font-bold">
        {gb(used)}
        <span className="text-sm font-normal text-muted-foreground"> / {gb(quota)}</span>
      </div>
      <Progress value={percent} aria-label="Usage vs quota" />
    </div>
  );
}

export function HostingStatsCards({ stats }: HostingStatsCardsProps) {
  const { accounts, mrr, usage, ssl } = stats;

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"
      role="region"
      aria-label="Hosting statistics"
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Accounts</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{accounts.total}</div>
          <p className="text-xs text-muted-foreground">
            {accounts.active} active · {accounts.suspended} suspended ·{' '}
            {accounts.provisioning} provisioning · {accounts.failed} failed
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">MRR</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${mrr.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground">Monthly recurring revenue</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Disk</CardTitle>
          <HardDrive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <QuotaRow used={usage.diskUsedGB} quota={usage.diskQuotaGB} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Bandwidth</CardTitle>
          <Network className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <QuotaRow used={usage.bandwidthUsedGB} quota={usage.bandwidthQuotaGB} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">SSL certificates</CardTitle>
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{ssl.active}</div>
          <p className="text-xs text-muted-foreground">
            {ssl.expiringWithin14Days} expiring &lt;14d · {ssl.failed} failed
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
