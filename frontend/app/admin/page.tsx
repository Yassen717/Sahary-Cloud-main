'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminNav } from '@/components/admin/AdminNav';
import { 
  Loader2, 
  Users, 
  Server,
  DollarSign,
  TrendingUp,
  Cpu,
  HardDrive,
  Activity,
  Shield
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ResourceKey = 'cpu' | 'ram' | 'storage' | 'bandwidth';
type ResourceAmounts = Record<ResourceKey, number>;

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  cpu: 'CPU (cores)',
  ram: 'RAM (MB)',
  storage: 'Storage (GB)',
  bandwidth: 'Bandwidth (GB/month)',
};

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalVMs: number;
  runningVMs: number;
  paymentsCollected: number;
}

interface ResourceUsage {
  used: ResourceAmounts;
  limits: ResourceAmounts;
  usage: ResourceAmounts;
}

interface PeriodPoint {
  period: string;
  count: number;
  total: number;
}

interface RevenueAnalytics {
  totalRevenue: number;
  revenueByPeriod: PeriodPoint[];
}

interface UserGrowth {
  totalSignups: number;
  signupsByPeriod: PeriodPoint[];
}

interface ActivityItem {
  id: string;
  action: string;
  resource: string;
  timestamp: string;
  user: { email: string; firstName: string; lastName: string } | null;
}

const formatCurrency = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPercent = (value: number | undefined) => `${(value ?? 0).toFixed(1)}%`;

function PeriodBars({
  points,
  valueOf,
  format,
  emptyText,
}: {
  points: PeriodPoint[];
  valueOf: (point: PeriodPoint) => number;
  format: (value: number) => string;
  emptyText: string;
}) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">{emptyText}</p>;
  }

  const max = Math.max(1, ...points.map(valueOf));

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {points.map((point) => (
        <div key={point.period} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-muted-foreground">{point.period}</span>
          <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${(valueOf(point) / max) * 100}%` }} />
          </div>
          <span className="w-28 text-right font-medium">{format(valueOf(point))}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [resources, setResources] = useState<ResourceUsage | null>(null);
  const [revenue, setRevenue] = useState<RevenueAnalytics | null>(null);
  const [growth, setGrowth] = useState<UserGrowth | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const loadAdminStats = async () => {
      try {
        const [statsResponse, revenueResponse, growthResponse, resourcesResponse] = await Promise.all([
          apiClient.getStats(),
          apiClient.getRevenueAnalytics(),
          apiClient.getUserGrowthAnalytics(),
          apiClient.getSystemResources(),
        ]);
        const data = statsResponse?.data;

        setStats({
          totalUsers: Number(data?.users?.total ?? 0),
          activeUsers: Number(data?.users?.active ?? 0),
          totalVMs: Number(data?.vms?.total ?? 0),
          runningVMs: Number(data?.vms?.statusDistribution?.RUNNING ?? 0),
          paymentsCollected: Number(data?.payments?.totalProcessed ?? 0),
        });
        setActivity(data?.recentActivity ?? []);
        setRevenue(revenueResponse?.data ?? null);
        setGrowth(growthResponse?.data ?? null);
        setResources(resourcesResponse?.data ?? null);
      } catch (error) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to load admin statistics',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    loadAdminStats();
    // Refresh every minute
    const interval = setInterval(loadAdminStats, 60000);
    return () => clearInterval(interval);
  }, [toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-lg">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">
              System overview and management
            </p>
          </div>
        </div>
      </div>

      <AdminNav />

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats ? stats.totalUsers.toLocaleString() : '—'}</div>
            <p className="text-xs text-muted-foreground">
              {stats ? `${stats.activeUsers.toLocaleString()} active` : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Virtual Machines</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats ? stats.totalVMs.toLocaleString() : '—'}</div>
            <p className="text-xs text-muted-foreground">
              {stats ? `${stats.runningVMs.toLocaleString()} running` : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payments Collected</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? formatCurrency(stats.paymentsCollected) : '—'}
            </div>
            <p className="text-xs text-muted-foreground">Completed payments, all time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue (30 days)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {revenue ? formatCurrency(revenue.totalRevenue) : '—'}
            </div>
            <p className="text-xs text-muted-foreground">Paid invoices, last 30 days</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="resources" className="space-y-6">
        <TabsList>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Resources Tab */}
        <TabsContent value="resources" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-blue-500" />
                  CPU Allocation
                </CardTitle>
                <CardDescription>Allocated vCPU cores vs. platform capacity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-3xl font-bold">{formatPercent(resources?.usage.cpu)}</span>
                    <span className="text-sm text-muted-foreground">of capacity</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3">
                    <div
                      className="bg-blue-500 h-3 rounded-full transition-all"
                      style={{ width: `${Math.min(100, resources?.usage.cpu ?? 0)}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-green-500" />
                  RAM Allocation
                </CardTitle>
                <CardDescription>Allocated memory vs. platform capacity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-3xl font-bold">{formatPercent(resources?.usage.ram)}</span>
                    <span className="text-sm text-muted-foreground">of capacity</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3">
                    <div
                      className="bg-green-500 h-3 rounded-full transition-all"
                      style={{ width: `${Math.min(100, resources?.usage.ram ?? 0)}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-yellow-500" />
                  Storage Allocation
                </CardTitle>
                <CardDescription>Allocated storage vs. platform capacity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-3xl font-bold">{formatPercent(resources?.usage.storage)}</span>
                    <span className="text-sm text-muted-foreground">of capacity</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3">
                    <div
                      className="bg-yellow-500 h-3 rounded-full transition-all"
                      style={{ width: `${Math.min(100, resources?.usage.storage ?? 0)}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Capacity Breakdown</CardTitle>
              <CardDescription>Allocated resources against configured platform limits</CardDescription>
            </CardHeader>
            <CardContent>
              {!resources ? (
                <p className="py-8 text-center text-muted-foreground">Resource data unavailable</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 font-medium">Resource</th>
                      <th className="py-2 text-right font-medium">Allocated</th>
                      <th className="py-2 text-right font-medium">Capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(RESOURCE_LABELS) as ResourceKey[]).map((key) => (
                      <tr key={key} className="border-t">
                        <td className="py-2">{RESOURCE_LABELS[key]}</td>
                        <td className="py-2 text-right">{resources.used[key].toLocaleString()}</td>
                        <td className="py-2 text-right">{resources.limits[key].toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest system events and user actions</CardDescription>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No recent activity</p>
              ) : (
                <div className="space-y-4">
                  {activity.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{item.user?.email ?? 'System'}</p>
                          <p className="text-sm text-muted-foreground">{item.action} · {item.resource}</p>
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>User Growth</CardTitle>
                <CardDescription>
                  {growth ? `${growth.totalSignups.toLocaleString()} signups in the last 30 days` : 'New user registrations over time'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PeriodBars
                  points={growth?.signupsByPeriod ?? []}
                  valueOf={(point) => point.count}
                  format={(value) => value.toLocaleString()}
                  emptyText="No signups in this period"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>
                  {revenue ? `${formatCurrency(revenue.totalRevenue)} from paid invoices in the last 30 days` : 'Paid invoice revenue over time'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PeriodBars
                  points={revenue?.revenueByPeriod ?? []}
                  valueOf={(point) => point.total}
                  format={formatCurrency}
                  emptyText="No paid invoices in this period"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
