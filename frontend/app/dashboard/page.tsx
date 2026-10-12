'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Server, Zap, DollarSign, Activity, Play, Square, Globe, ChevronRight } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/StatsCard';
import type { SolarChartPoint } from '@/components/dashboard/SolarChart';

// Lazy load heavy chart component
const SolarChart = dynamic(
  () => import('@/components/dashboard/SolarChart').then(mod => ({ default: mod.SolarChart })),
  {
    loading: () => (
      <Card>
        <CardHeader>
          <CardTitle>Solar Production</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    ),
    ssr: false
  }
);

const toChartData = (records: any[] = []): SolarChartPoint[] =>
  [...records].reverse().map((record) => ({
    time: new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    production: Number(record.production) || 0,
    consumption: Number(record.consumption) || 0,
  }));

export default function DashboardPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [vms, setVms] = useState<any[]>([]);
  const [solarStatus, setSolarStatus] = useState<any>(null);
  const [solarHistory, setSolarHistory] = useState<SolarChartPoint[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [actionVmId, setActionVmId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setError('');

    const [vmsResult, solarResult, usageResult, historyResult] = await Promise.allSettled([
      apiClient.getVMs(),
      apiClient.getSolarStatus(),
      apiClient.getUsage(),
      apiClient.getSolarHistory(),
    ]);

    if (vmsResult.status === 'fulfilled') setVms(vmsResult.value.data || []);
    if (solarResult.status === 'fulfilled') setSolarStatus(solarResult.value.data);
    if (usageResult.status === 'fulfilled') setUsage(usageResult.value.data);
    if (historyResult.status === 'fulfilled') setSolarHistory(toChartData(historyResult.value.data));

    const failures = [vmsResult, solarResult, usageResult, historyResult].filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.length === 4) {
      setError(failures[0].reason?.message || 'فشل تحميل البيانات');
      console.error('Dashboard error:', failures[0].reason);
    } else if (failures.length > 0) {
      toast({
        title: 'Some data failed to load',
        description: failures[0].reason?.message,
        variant: 'destructive',
      });
    }

    setLoading(false);
  };

  const handleVmAction = async (vm: any) => {
    try {
      setActionVmId(vm.id);
      if (vm.status === 'RUNNING') {
        await apiClient.stopVM(vm.id);
      } else {
        await apiClient.startVM(vm.id);
      }
      await loadDashboardData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'VM action failed', variant: 'destructive' });
    } finally {
      setActionVmId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive animate-fade-in">
          <CardHeader>
            <CardTitle className="text-destructive">Connection Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={loadDashboardData} className="transition-all-smooth hover:scale-105">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const runningVMs = vms.filter(vm => vm.status === 'RUNNING').length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here&apos;s your overview</p>
      </div>

      {/* Stats Cards */}
      <div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        role="region"
        aria-label="Dashboard statistics"
      >
        <StatsCard
          title="Total VMs"
          value={vms.length}
          description={`${runningVMs} running`}
          icon={Server}
          iconColor="text-primary"
          delay={0}
        />

        <StatsCard
          title="Solar Production"
          value={solarStatus ? `${(solarStatus.production ?? 0).toFixed(2)} kW` : '—'}
          description={solarStatus ? `${(solarStatus.efficiency ?? 0).toFixed(1)}% efficiency` : 'Unavailable'}
          icon={Zap}
          iconColor="text-yellow-500"
          delay={100}
        />

        <StatsCard
          title="Monthly Usage"
          value={`$${usage?.totalCost?.toFixed(2) || '0.00'}`}
          description={`${usage?.totalHours ?? Math.round((usage?.totalDuration || 0) / 60)} hours`}
          icon={DollarSign}
          iconColor="text-green-500"
          delay={200}
        />

        <StatsCard
          title="Battery Level"
          value={solarStatus?.batteryLevel != null ? `${solarStatus.batteryLevel}%` : '—'}
          description={solarStatus?.status ? `System ${solarStatus.status}` : 'Status unavailable'}
          icon={Activity}
          iconColor="text-blue-500"
          delay={300}
        />
      </div>

      {/* Solar Chart */}
      <SolarChart data={solarHistory} />

      {/* Quick navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
        <Link href="/dashboard/hosting" className="block hover-lift">
          <Card className="h-full border-2 hover:border-primary/50 transition-all-smooth cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Hosting</CardTitle>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardDescription>Manage your domains and subdomain</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {/* VMs Grid */}
      <Card className="animate-fade-in opacity-0 stagger-3">
        <CardHeader>
          <CardTitle>Your Virtual Machines</CardTitle>
          <CardDescription>Manage your VPS instances</CardDescription>
        </CardHeader>
        <CardContent>
          {vms.length === 0 ? (
            <div className="text-center py-12" role="status" aria-label="No virtual machines">
              <Server className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" aria-hidden="true" />
              <p className="text-muted-foreground mb-4">
                No VMs found. Create your first VM to get started.
              </p>
              <Button asChild className="transition-all-smooth hover:scale-105">
                <Link href="/vms/create">Create VM</Link>
              </Button>
            </div>
          ) : (
            <div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              role="list"
              aria-label="Virtual machines list"
            >
              {vms.map((vm, index) => (
                <Card
                  key={vm.id}
                  className="hover-lift border-2 transition-all-smooth animate-scale-in opacity-0"
                  style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
                  role="listitem"
                  aria-label={`Virtual machine ${vm.name}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{vm.name}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {vm.cpu} CPU • {vm.ram / 1024}GB RAM • {vm.storage}GB
                        </CardDescription>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 transition-all-smooth ${vm.status === 'RUNNING'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        role="status"
                        aria-label={`Status: ${vm.status}`}
                      >
                        {vm.status === 'RUNNING' && (
                          <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse-slow" aria-hidden="true" />
                        )}
                        {vm.status}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={vm.status === 'RUNNING' ? 'destructive' : 'default'}
                        className="flex-1 transition-all-smooth hover:scale-105"
                        aria-label={vm.status === 'RUNNING' ? `Stop ${vm.name}` : `Start ${vm.name}`}
                        disabled={actionVmId !== null}
                        onClick={() => handleVmAction(vm)}
                      >
                        {vm.status === 'RUNNING' ? (
                          <>
                            <Square className="h-3 w-3 mr-1" aria-hidden="true" />
                            Stop
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-1" aria-hidden="true" />
                            Start
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 transition-all-smooth hover:scale-105"
                        asChild
                      >
                        <Link href={`/vms/${vm.id}`} aria-label={`Manage ${vm.name}`}>Manage</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
