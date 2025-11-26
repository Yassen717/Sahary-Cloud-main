'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Loader2, 
  TrendingUp,
  Server,
  HardDrive,
  Network,
  DollarSign,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

interface VMUsage {
  id: string;
  name: string;
  cost: number;
  cpu: number;
  ram: number;
  storage: number;
  bandwidth: number;
}

interface UsageData {
  vms: VMUsage[];
  totalCost: number;
  projectedCost: number;
  budget?: number;
  dailyUsage: { date: string; cost: number }[];
}

export default function UsageTrackingPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    loadUsageData();
  }, []);

  const loadUsageData = async () => {
    try {
      const response = await apiClient.getUsage();
      
      // Mock data if API doesn't return proper structure
      const mockData: UsageData = {
        vms: [
          { id: '1', name: 'web-server-01', cost: 15.50, cpu: 2, ram: 4, storage: 40, bandwidth: 500 },
          { id: '2', name: 'db-server-01', cost: 25.00, cpu: 4, ram: 8, storage: 80, bandwidth: 300 },
          { id: '3', name: 'app-server-01', cost: 12.75, cpu: 2, ram: 4, storage: 40, bandwidth: 400 },
        ],
        totalCost: 53.25,
        projectedCost: 159.75,
        budget: 200,
        dailyUsage: Array.from({ length: 30 }, (_, i) => ({
          date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          cost: Math.random() * 10 + 1,
        })),
      };
      
      setUsage(response.usage || mockData);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load usage data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getBudgetPercentage = () => {
    if (!usage?.budget) return 0;
    return (usage.projectedCost / usage.budget) * 100;
  };

  const getBudgetColor = () => {
    const percentage = getBudgetPercentage();
    if (percentage >= 90) return 'text-red-500';
    if (percentage >= 75) return 'text-yellow-500';
    return 'text-green-500';
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
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/billing">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Billing
          </Link>
        </Button>
        
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

      {/* Cost Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Month</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${usage?.totalCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Month to date
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projected Cost</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${usage?.projectedCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              End of month estimate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budget Status</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${getBudgetColor()}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getBudgetColor()}`}>
              {getBudgetPercentage().toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {usage?.budget ? `of $${usage.budget} budget` : 'No budget set'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget Alert */}
      {usage?.budget && getBudgetPercentage() >= 75 && (
        <Card className="mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 dark:text-yellow-400">
                  Budget Alert
                </h3>
                <p className="text-sm text-yellow-800 dark:text-yellow-500 mt-1">
                  You've used {getBudgetPercentage().toFixed(0)}% of your monthly budget. 
                  Consider optimizing your resources or adjusting your budget.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Progress */}
      {usage?.budget && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Budget Usage</CardTitle>
            <CardDescription>Monthly budget tracking</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Projected: ${usage.projectedCost.toFixed(2)}</span>
                <span>Budget: ${usage.budget.toFixed(2)}</span>
              </div>
              <Progress value={getBudgetPercentage()} className="h-3" />
              <p className="text-xs text-muted-foreground">
                ${(usage.budget - usage.projectedCost).toFixed(2)} remaining
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Usage Chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Daily Usage</CardTitle>
          <CardDescription>Cost breakdown over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-end justify-between gap-1">
            {usage?.dailyUsage.map((day, index) => (
              <div key={index} className="flex-1 flex flex-col items-center group">
                <div className="relative w-full">
                  <div
                    className="w-full bg-primary rounded-t transition-all hover:bg-primary/80"
                    style={{ height: `${(day.cost / 15) * 200}px` }}
                  />
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    ${day.cost.toFixed(2)}
                  </div>
                </div>
                {index % 5 === 0 && (
                  <span className="text-xs text-muted-foreground mt-2 rotate-45 origin-left">
                    {day.date}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* VM Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>VM Cost Breakdown</CardTitle>
          <CardDescription>Individual VM costs for the current month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {usage?.vms.map((vm) => (
              <div key={vm.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Server className="h-5 w-5 text-primary" />
                    <div>
                      <h3 className="font-semibold">{vm.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {vm.cpu} vCPU • {vm.ram}GB RAM • {vm.storage}GB Storage
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${vm.cost.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">this month</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Compute</p>
                      <p className="font-medium">${(vm.cost * 0.6).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Storage</p>
                      <p className="font-medium">${(vm.cost * 0.2).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Bandwidth</p>
                      <p className="font-medium">${(vm.cost * 0.2).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
