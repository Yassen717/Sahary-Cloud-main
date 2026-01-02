'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Server, Zap, DollarSign, Activity, Play, Square } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { SolarChart } from '@/components/dashboard/SolarChart';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [vms, setVms] = useState<any[]>([]);
  const [solarStatus, setSolarStatus] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load VMs
      const vmsData = await apiClient.getVMs();
      setVms(vmsData.vms || []);

      // Load Solar Status
      const solarData = await apiClient.getSolarStatus();
      setSolarStatus(solarData);

      // Load Usage
      const usageData = await apiClient.getUsage();
      setUsage(usageData);

    } catch (err: any) {
      setError(err.message || 'فشل تحميل البيانات');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
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

  const runningVMs = vms.filter(vm => vm.status === 'running').length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="animate-fade-in">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's your overview</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total VMs"
          value={vms.length}
          description={`${runningVMs} running`}
          icon={Server}
          iconColor="text-primary"
          delay={0}
          trend={runningVMs > 0 ? { value: 12, isPositive: true } : undefined}
        />

        <StatsCard
          title="Solar Production"
          value={`${solarStatus?.currentProduction || 0} kW`}
          description={`${solarStatus?.efficiency || 0}% efficiency`}
          icon={Zap}
          iconColor="text-yellow-500"
          delay={100}
          trend={{ value: 8, isPositive: true }}
        />

        <StatsCard
          title="Monthly Usage"
          value={`$${usage?.totalCost?.toFixed(2) || '0.00'}`}
          description={`${usage?.totalHours || 0} hours`}
          icon={DollarSign}
          iconColor="text-green-500"
          delay={200}
          trend={{ value: 3, isPositive: false }}
        />

        <StatsCard
          title="System Status"
          value={`${solarStatus?.batteryLevel || 0}%`}
          description="Battery Level"
          icon={Activity}
          iconColor="text-blue-500"
          delay={300}
        />
      </div>

      {/* Solar Chart */}
      <SolarChart />

      {/* VMs Grid */}
      <Card className="animate-fade-in opacity-0 stagger-3">
        <CardHeader>
          <CardTitle>Your Virtual Machines</CardTitle>
          <CardDescription>Manage your VPS instances</CardDescription>
        </CardHeader>
        <CardContent>
          {vms.length === 0 ? (
            <div className="text-center py-12">
              <Server className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground mb-4">
                No VMs found. Create your first VM to get started.
              </p>
              <Button className="transition-all-smooth hover:scale-105">
                Create VM
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vms.map((vm, index) => (
                <Card
                  key={vm.id}
                  className="hover-lift border-2 transition-all-smooth animate-scale-in opacity-0"
                  style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{vm.name}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {vm.cpu} CPU • {vm.ram}GB RAM • {vm.storage}GB
                        </CardDescription>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 transition-all-smooth ${vm.status === 'running'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                      >
                        {vm.status === 'running' && (
                          <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse-slow" />
                        )}
                        {vm.status}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={vm.status === 'running' ? 'destructive' : 'default'}
                        className="flex-1 transition-all-smooth hover:scale-105"
                      >
                        {vm.status === 'running' ? (
                          <>
                            <Square className="h-3 w-3 mr-1" />
                            Stop
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-1" />
                            Start
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 transition-all-smooth hover:scale-105"
                      >
                        Manage
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
