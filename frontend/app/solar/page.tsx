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
  currentProduction: number;
  batteryLevel: number;
  currentConsumption: number;
  availablePower: number;
  efficiency: number;
  status: string;
}

interface ProductionData {
  daily: { time: string; production: number }[];
  monthly: { month: string; production: number }[];
}

interface EnvironmentalImpact {
  co2Saved: number;
  treesEquivalent: number;
  cleanEnergyPercentage: number;
  traditionalEnergyComparison: number;
}

export default function SolarDashboardPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SolarStatus | null>(null);
  const [production, setProduction] = useState<ProductionData | null>(null);
  const [impact, setImpact] = useState<EnvironmentalImpact | null>(null);

  useEffect(() => {
    loadSolarData();
    // Refresh every 30 seconds
    const interval = setInterval(loadSolarData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadSolarData = async () => {
    try {
      const [statusData, productionData, impactData] = await Promise.all([
        apiClient.getSolarStatus(),
        apiClient.getSolarProduction(),
        apiClient.getEnvironmentalImpact(),
      ]);

      setStatus(statusData);
      setProduction(productionData);
      setImpact(impactData);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load solar data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getBatteryColor = (level: number) => {
    if (level >= 80) return 'text-green-500';
    if (level >= 50) return 'text-yellow-500';
    if (level >= 20) return 'text-orange-500';
    return 'text-red-500';
  };

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
              {status?.currentProduction.toFixed(2) || 0} kW
            </div>
            <p className="text-xs text-muted-foreground">
              Real-time solar generation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Battery Level</CardTitle>
            <Battery className={`h-4 w-4 ${getBatteryColor(status?.batteryLevel || 0)}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status?.batteryLevel.toFixed(0) || 0}%
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
              {status?.currentConsumption.toFixed(2) || 0} kW
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
              {status?.efficiency.toFixed(1) || 0}%
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
              <CardTitle>Daily Production</CardTitle>
              <CardDescription>Solar energy generation over the last 24 hours</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80 flex items-end justify-between gap-2">
                {production?.daily.map((data, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-yellow-500 rounded-t transition-all hover:bg-yellow-600"
                      style={{ height: `${(data.production / 10) * 100}%` }}
                    />
                    <span className="text-xs text-muted-foreground mt-2">
                      {data.time}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Production</CardTitle>
              <CardDescription>Solar energy generation over the last 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80 flex items-end justify-between gap-2">
                {production?.monthly.map((data, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-green-500 rounded-t transition-all hover:bg-green-600"
                      style={{ height: `${(data.production / 500) * 100}%` }}
                    />
                    <span className="text-xs text-muted-foreground mt-2">
                      {data.month}
                    </span>
                  </div>
                ))}
              </div>
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
                <CardDescription>Carbon footprint reduction</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-green-500">
                  {impact?.co2Saved.toFixed(2) || 0} kg
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Equivalent to planting {impact?.treesEquivalent || 0} trees
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
                  {impact?.cleanEnergyPercentage.toFixed(1) || 0}%
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Of total energy consumption
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
                    {impact?.treesEquivalent || 0}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Traditional Energy Saved</p>
                    <p className="text-sm text-muted-foreground">
                      Compared to grid power
                    </p>
                  </div>
                  <div className="text-2xl font-bold text-blue-500">
                    {impact?.traditionalEnergyComparison.toFixed(1) || 0} kWh
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
                    {impact?.cleanEnergyPercentage.toFixed(1) || 0}%
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
                    {status?.efficiency.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${status?.efficiency}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Battery Level</span>
                  <span className="text-sm text-muted-foreground">
                    {status?.batteryLevel.toFixed(0)}%
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
                    style={{ width: `${status?.batteryLevel}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Available Power</span>
                  <span className="text-sm text-muted-foreground">
                    {status?.availablePower.toFixed(2)} kW
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min((status?.availablePower || 0) / 10 * 100, 100)}%` }}
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
                  <p className="text-2xl font-bold">{status?.currentProduction.toFixed(2)} kW</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <Battery className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Storage</p>
                  <p className="text-2xl font-bold">{status?.batteryLevel.toFixed(0)}%</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <Zap className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Consumption</p>
                  <p className="text-2xl font-bold">{status?.currentConsumption.toFixed(2)} kW</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
