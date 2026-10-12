'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, 
  Sun, 
  Battery, 
  Zap,
  TrendingUp,
  Leaf,
  Activity
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SolarStatus {
  production: number;
  consumption: number;
  batteryLevel: number;
  efficiency: number;
  status: string;
}

interface SolarStatistics {
  totalProduction: number;
  totalConsumption: number;
  environmentalImpact: {
    co2Saved: number;
    treesEquivalent: number;
    solarEnergyUsed: number;
  };
}

interface ProductionBucket {
  label: string;
  production: number;
}

const bucketProduction = (
  records: Array<{ timestamp: string; production: number }>,
  keyOf: (date: Date) => string,
  labelOf: (date: Date) => string,
): ProductionBucket[] => {
  const buckets = new Map<string, ProductionBucket>();
  for (const record of records) {
    const date = new Date(record.timestamp);
    const key = keyOf(date);
    const bucket = buckets.get(key) ?? { label: labelOf(date), production: 0 };
    bucket.production += Number(record.production) || 0;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, bucket]) => bucket);
};

const BarChart = ({ buckets, color, emptyText }: { buckets: ProductionBucket[]; color: string; emptyText: string }) => {
  if (buckets.length === 0) {
    return <div className="h-80 flex items-center justify-center text-sm text-muted-foreground">{emptyText}</div>;
  }
  const max = Math.max(...buckets.map((bucket) => bucket.production), 0);
  return (
    <div className="h-80 flex items-end justify-between gap-2">
      {buckets.map((bucket, index) => (
        <div key={index} className="flex-1 flex flex-col items-center h-full justify-end" title={`${bucket.production.toFixed(2)} kWh`}>
          <div
            className={`w-full ${color} rounded-t-sm transition-all`}
            style={{ height: `${max > 0 ? (bucket.production / max) * 100 : 0}%` }}
          />
          <span className="text-xs text-muted-foreground mt-2">{bucket.label}</span>
        </div>
      ))}
    </div>
  );
};

export default function SolarDashboardPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SolarStatus | null>(null);
  const [statistics, setStatistics] = useState<SolarStatistics | null>(null);
  const [hourly, setHourly] = useState<ProductionBucket[]>([]);
  const [daily, setDaily] = useState<ProductionBucket[]>([]);

  useEffect(() => {
    loadSolarData();
    // Refresh every 30 seconds
    const interval = setInterval(loadSolarData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadSolarData = async () => {
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [statusResult, statisticsResult, dayResult, weekResult] = await Promise.allSettled([
      apiClient.getSolarStatus(),
      apiClient.getSolarStatistics({ period: 'day' }),
      apiClient.getSolarHistory(),
      apiClient.getSolarHistory({ startDate: weekStart }),
    ]);

    if (statusResult.status === 'fulfilled') setStatus(statusResult.value.data ?? null);
    if (statisticsResult.status === 'fulfilled') setStatistics(statisticsResult.value.data ?? null);
    if (dayResult.status === 'fulfilled') {
      setHourly(bucketProduction(
        dayResult.value.data ?? [],
        (date) => date.toISOString().slice(0, 13),
        (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ));
    }
    if (weekResult.status === 'fulfilled') {
      setDaily(bucketProduction(
        weekResult.value.data ?? [],
        (date) => date.toISOString().slice(0, 10),
        (date) => date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      ));
    }

    const failed = [statusResult, statisticsResult, dayResult, weekResult].find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed) {
      toast({
        title: 'Error',
        description: failed.reason?.message || 'Failed to load solar data',
        variant: 'destructive',
      });
    }
    setLoading(false);
  };

  const getBatteryColor = (level: number) => {
    if (level >= 80) return 'text-green-500';
    if (level >= 50) return 'text-yellow-500';
    if (level >= 20) return 'text-orange-500';
    return 'text-red-500';
  };

  const impact = statistics?.environmentalImpact;
  const cleanEnergyPercentage =
    statistics && statistics.totalConsumption > 0
      ? (Math.min(statistics.totalProduction, statistics.totalConsumption) / statistics.totalConsumption) * 100
      : 0;

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
          <div className="p-3 bg-yellow-500/10 rounded-lg">
            <Sun className="h-8 w-8 text-yellow-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Solar Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor your solar energy production and environmental impact
            </p>
          </div>
        </div>
      </div>

      {/* Current Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Production</CardTitle>
            <Sun className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status ? `${(status.production ?? 0).toFixed(2)} kW` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              Real-time solar generation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Battery Level</CardTitle>
            <Battery className={`h-4 w-4 ${getBatteryColor(status?.batteryLevel ?? 0)}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status?.batteryLevel != null ? `${status.batteryLevel.toFixed(0)}%` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              Energy storage capacity
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Consumption</CardTitle>
            <Zap className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status ? `${(status.consumption ?? 0).toFixed(2)} kW` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              Active power usage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Efficiency</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status ? `${(status.efficiency ?? 0).toFixed(1)}%` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              Overall system performance
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="production" className="space-y-6">
        <TabsList>
          <TabsTrigger value="production">Production</TabsTrigger>
          <TabsTrigger value="impact">Environmental Impact</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        {/* Production Tab */}
        <TabsContent value="production" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Hourly Production</CardTitle>
              <CardDescription>Energy produced per hour (kWh) over the last 24 hours</CardDescription>
            </CardHeader>
            <CardContent>
              <BarChart
                buckets={hourly}
                color="bg-yellow-500 hover:bg-yellow-600"
                emptyText="No production data recorded in the last 24 hours"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily Production</CardTitle>
              <CardDescription>Energy produced per day (kWh) over the last 7 days, from the 500 most recent samples</CardDescription>
            </CardHeader>
            <CardContent>
              <BarChart
                buckets={daily}
                color="bg-green-500 hover:bg-green-600"
                emptyText="No production data recorded in the last 7 days"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Environmental Impact Tab */}
        <TabsContent value="impact" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Leaf className="h-5 w-5 text-green-500" />
                  CO₂ Emissions Saved
                </CardTitle>
                <CardDescription>Carbon footprint reduction today</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-green-500">
                  {(impact?.co2Saved ?? 0).toFixed(2)} kg
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Equivalent to planting {impact?.treesEquivalent ?? 0} trees
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  Clean Energy Usage
                </CardTitle>
                <CardDescription>Renewable energy percentage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-blue-500">
                  {cleanEnergyPercentage.toFixed(1)}%
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Of total energy consumption covered by solar today
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Environmental Benefits</CardTitle>
              <CardDescription>Your contribution to a cleaner planet</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Trees Equivalent</p>
                    <p className="text-sm text-muted-foreground">
                      CO₂ absorption capacity
                    </p>
                  </div>
                  <div className="text-2xl font-bold text-green-500">
                    {impact?.treesEquivalent ?? 0}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Solar Energy Used</p>
                    <p className="text-sm text-muted-foreground">
                      Compared to grid power
                    </p>
                  </div>
                  <div className="text-2xl font-bold text-blue-500">
                    {(impact?.solarEnergyUsed ?? 0).toFixed(1)} kWh
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Clean Energy Percentage</p>
                    <p className="text-sm text-muted-foreground">
                      Renewable energy usage
                    </p>
                  </div>
                  <div className="text-2xl font-bold text-yellow-500">
                    {cleanEnergyPercentage.toFixed(1)}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Metrics</CardTitle>
              <CardDescription>Detailed solar system performance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">System Efficiency</span>
                  <span className="text-sm text-muted-foreground">
                    {(status?.efficiency ?? 0).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(status?.efficiency ?? 0, 100)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Battery Level</span>
                  <span className="text-sm text-muted-foreground">
                    {(status?.batteryLevel ?? 0).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      (status?.batteryLevel || 0) >= 80 ? 'bg-green-500' :
                      (status?.batteryLevel || 0) >= 50 ? 'bg-yellow-500' :
                      (status?.batteryLevel || 0) >= 20 ? 'bg-orange-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${status?.batteryLevel ?? 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Surplus Production</span>
                  <span className="text-sm text-muted-foreground">
                    {Math.max((status?.production ?? 0) - (status?.consumption ?? 0), 0).toFixed(2)} kW
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(Math.max((status?.production ?? 0) - (status?.consumption ?? 0), 0) / 10 * 100, 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Power Flow</CardTitle>
              <CardDescription>Current energy distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg text-center">
                  <Sun className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Production</p>
                  <p className="text-2xl font-bold">{(status?.production ?? 0).toFixed(2)} kW</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <Battery className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Storage</p>
                  <p className="text-2xl font-bold">{(status?.batteryLevel ?? 0).toFixed(0)}%</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <Zap className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Consumption</p>
                  <p className="text-2xl font-bold">{(status?.consumption ?? 0).toFixed(2)} kW</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
