'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BillingNav } from '@/components/billing/BillingNav';
import { 
  Loader2, 
  TrendingUp,
  Server,
  Network,
  Cpu,
  MemoryStick,
  DollarSign,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VMUsage {
  id: string;
  name: string;
  cost: number;
  cpuAverage: number;
  ramAverageMB: number;
  bandwidthGB: number;
}

interface UsageData {
  totalCost: number;
  vmCount: number;
  bandwidthGB: number;
  vms: VMUsage[];
}

interface BackendVMUsage {
  vmId: string;
  vmName: string;
  totalCost: number;
  totalBandwidth: number;
  averages: { cpu: number; ram: number };
}

export default function UsageTrackingPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    apiClient.getUsage({ startDate: startOfMonth.toISOString() })
      .then((response) => {
        const data = response?.data;
        setUsage({
          totalCost: Number(data?.totalCost ?? 0),
          vmCount: Number(data?.vmCount ?? 0),
          bandwidthGB: Number(data?.totalBandwidth ?? 0),
          vms: (data?.vms ?? []).map((vm: BackendVMUsage) => ({
            id: vm.vmId,
            name: vm.vmName,
            cost: Number(vm.totalCost ?? 0),
            cpuAverage: Number(vm.averages?.cpu ?? 0),
            ramAverageMB: Number(vm.averages?.ram ?? 0),
            bandwidthGB: Number(vm.totalBandwidth ?? 0),
          })),
        });
      })
      .catch((error: Error) => toast({
        title: 'Error',
        description: error.message || 'Failed to load usage data',
        variant: 'destructive',
      }))
      .finally(() => setLoading(false));
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
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Usage Tracking</h1>
            <p className="text-muted-foreground">
              Monitor your resource usage and costs
            </p>
          </div>
        </div>
      </div>

      <BillingNav />

      {/* Cost Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost This Month</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${usage ? usage.totalCost.toFixed(2) : '—'}</div>
            <p className="text-xs text-muted-foreground">Since the start of the current month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bandwidth This Month</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usage ? usage.bandwidthGB.toFixed(2) : '—'} GB</div>
            <p className="text-xs text-muted-foreground">Total transferred</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Virtual Machines</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usage ? usage.vmCount : '—'}</div>
            <p className="text-xs text-muted-foreground">Owned by your account</p>
          </CardContent>
        </Card>
      </div>

      {/* VM Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>VM Usage Breakdown</CardTitle>
          <CardDescription>Per-VM cost and average utilization for the current month</CardDescription>
        </CardHeader>
        <CardContent>
          {!usage || usage.vms.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">No usage recorded this month</p>
          ) : (
            <div className="space-y-4">
              {usage.vms.map((vm) => (
                <div key={vm.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Server className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">{vm.name}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">${vm.cost.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">this month</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-muted-foreground">Avg CPU</p>
                        <p className="font-medium">{vm.cpuAverage.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MemoryStick className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-muted-foreground">Avg RAM</p>
                        <p className="font-medium">{vm.ramAverageMB.toFixed(0)} MB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-muted-foreground">Bandwidth</p>
                        <p className="font-medium">{vm.bandwidthGB.toFixed(2)} GB</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
