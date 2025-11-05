'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Server, Zap, DollarSign, Activity } from 'lucide-react';

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
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-600">خطأ في الاتصال</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={loadDashboardData}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total VMs</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vms.length}</div>
            <p className="text-xs text-muted-foreground">
              {vms.filter(vm => vm.status === 'running').length} running
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solar Production</CardTitle>
            <Zap className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {solarStatus?.currentProduction || 0} kW
            </div>
            <p className="text-xs text-muted-foreground">
              {solarStatus?.efficiency || 0}% efficiency
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Usage</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${usage?.totalCost?.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              {usage?.totalHours || 0} hours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {solarStatus?.batteryLevel || 0}%
            </div>
            <p className="text-xs text-muted-foreground">Battery Level</p>
          </CardContent>
        </Card>
      </div>

      {/* VMs List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Virtual Machines</CardTitle>
          <CardDescription>Manage your VPS instances</CardDescription>
        </CardHeader>
        <CardContent>
          {vms.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No VMs found. Create your first VM to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {vms.map((vm) => (
                <div
                  key={vm.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <h3 className="font-semibold">{vm.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {vm.cpu} CPU • {vm.ram}GB RAM • {vm.storage}GB Storage
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        vm.status === 'running'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {vm.status}
                    </span>
                    <Button size="sm" variant="outline">
                      Manage
                    </Button>
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
