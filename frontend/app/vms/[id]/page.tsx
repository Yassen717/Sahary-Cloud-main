'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Server,
  Play,
  Square,
  RotateCw,
  Trash2,
  ArrowLeft,
  Cpu,
  HardDrive,
  Activity,
  Clock,
  AlertCircle,
  Terminal
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

const VmTerminal = dynamic(() => import('@/components/vm/VmTerminal'), { ssr: false });
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface VM {
  id: string;
  name: string;
  status: string;
  cpu: number;
  ram: number;
  storage: number;
  ipAddress?: string | null;
  port?: number | null;
  dockerImage?: string | null;
  dockerContainerId?: string | null;
  startedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VMStats {
  totalRecords: number;
  totalCost: number;
  averageCPU: number;
  averageRAM: number;
  totalBandwidth: number;
  peakCPU: number;
  peakRAM: number;
}

export default function VMDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [vm, setVm] = useState<VM | null>(null);
  const [stats, setStats] = useState<VMStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [logs, setLogs] = useState<string | null>(null);
  const [logsMessage, setLogsMessage] = useState<string | null>(null);
  const [logsError, setLogsError] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    loadVMDetails();
    const interval = setInterval(loadVMDetails, 30000);
    return () => clearInterval(interval);
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      try {
        const response = await apiClient.getVMStats(params.id as string);
        if (!cancelled) {
          setStats(response.data);
          setStatsError(false);
        }
      } catch {
        if (!cancelled) {
          setStats(null);
          setStatsError(true);
        }
      }
    };
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [params.id]);

  const loadVMDetails = async () => {
    try {
      const response = await apiClient.getVM(params.id as string);
      setVm(response.data.vm);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load VM details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      setLogsLoading(true);
      const response = await apiClient.getVMLogs(params.id as string, { tail: 200 });
      const data = response.data ?? {};
      setLogs(typeof data.logs === 'string' ? data.logs : null);
      setLogsMessage(data.message ?? null);
      setLogsError('');
    } catch (error: any) {
      setLogs(null);
      setLogsMessage(null);
      setLogsError(error.message || 'Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    try {
      setActionLoading(action);
      if (action === 'start') {
        await apiClient.startVM(params.id as string);
      } else if (action === 'stop') {
        await apiClient.stopVM(params.id as string);
      } else {
        await apiClient.restartVM(params.id as string);
      }
      toast({
        title: 'Success',
        description: `VM ${action} initiated successfully`,
      });
      await loadVMDetails();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || `Failed to ${action} VM`,
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    try {
      setActionLoading('delete');
      await apiClient.deleteVM(params.id as string);
      toast({
        title: 'Success',
        description: 'VM deleted successfully',
      });
      router.push('/vms');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete VM',
        variant: 'destructive',
      });
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'running':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'stopped':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!vm) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">VM Not Found</h3>
            <p className="text-muted-foreground mb-4">
              The requested VM could not be found
            </p>
            <Button asChild>
              <Link href="/vms">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to VMs
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ramPercent = (mb: number) => (vm.ram > 0 ? (mb / vm.ram) * 100 : 0);
  const usageBars = stats
    ? [
        { label: 'Average CPU', value: stats.averageCPU, color: 'bg-primary' },
        { label: 'Peak CPU', value: stats.peakCPU, color: 'bg-primary/60' },
        { label: 'Average RAM', value: ramPercent(stats.averageRAM), color: 'bg-blue-500' },
        { label: 'Peak RAM', value: ramPercent(stats.peakRAM), color: 'bg-blue-500/60' },
      ]
    : [];

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/vms">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to VMs
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Server className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{vm.name}</h1>
              <p className="text-muted-foreground">
                Created {new Date(vm.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <Badge className={getStatusColor(vm.status)}>
            {vm.status}
          </Badge>
        </div>
      </div>

      {/* Action Buttons */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => handleAction('start')}
              disabled={vm.status === 'RUNNING' || actionLoading !== null}
            >
              {actionLoading === 'start' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start
            </Button>

            <Button
              variant="outline"
              onClick={() => handleAction('stop')}
              disabled={vm.status === 'STOPPED' || actionLoading !== null}
            >
              {actionLoading === 'stop' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Square className="mr-2 h-4 w-4" />
              )}
              Stop
            </Button>

            <Button
              variant="outline"
              onClick={() => handleAction('restart')}
              disabled={vm.status !== 'RUNNING' || actionLoading !== null}
            >
              {actionLoading === 'restart' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="mr-2 h-4 w-4" />
              )}
              Restart
            </Button>

            <div className="ml-auto">
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                disabled={actionLoading !== null}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-6" onValueChange={(value) => value === 'logs' && loadLogs()}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="console">
            <Terminal className="mr-1.5 h-3.5 w-3.5" />
            Console
          </TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CPU</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vm.cpu} vCPU</div>
                <p className="text-xs text-muted-foreground">
                  {statsError ? 'Usage unavailable' : stats ? `${stats.averageCPU.toFixed(1)}% average usage` : 'Loading usage…'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">RAM</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vm.ram / 1024} GB</div>
                <p className="text-xs text-muted-foreground">
                  {statsError ? 'Usage unavailable' : stats ? `${ramPercent(stats.averageRAM).toFixed(1)}% average usage` : 'Loading usage…'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Storage</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vm.storage} GB</div>
                <p className="text-xs text-muted-foreground">Allocated</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Last Started</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {vm.startedAt ? new Date(vm.startedAt).toLocaleDateString() : 'Never'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {vm.startedAt ? new Date(vm.startedAt).toLocaleTimeString() : 'Not started yet'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>VM Information</CardTitle>
              <CardDescription>Detailed information about this virtual machine</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">VM ID</p>
                  <p className="text-sm font-mono">{vm.id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Docker Image</p>
                  <p className="text-sm">{vm.dockerImage ?? 'Not set'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">IP Address</p>
                  <p className="text-sm font-mono">{vm.ipAddress || 'Not assigned'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <p className="text-sm capitalize">{vm.status}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Created</p>
                  <p className="text-sm">{new Date(vm.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                  <p className="text-sm">{new Date(vm.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="stats" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resource Usage</CardTitle>
              <CardDescription>Usage averages and peaks from recorded samples (refreshes every 30 seconds)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {statsError && (
                <p className="text-sm text-muted-foreground">Unavailable: could not load VM statistics.</p>
              )}
              {!statsError && !stats && (
                <p className="text-sm text-muted-foreground">Loading statistics…</p>
              )}
              {usageBars.map((bar) => (
                <div key={bar.label}>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">{bar.label}</span>
                    <span className="text-sm text-muted-foreground">{bar.value.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className={`${bar.color} h-2 rounded-full transition-all`}
                      style={{ width: `${Math.min(bar.value, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {stats && (
            <Card>
              <CardHeader>
                <CardTitle>Recorded Totals</CardTitle>
                <CardDescription>Totals across all recorded usage samples</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Samples</p>
                    <p className="text-2xl font-bold">{stats.totalRecords}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Cost</p>
                    <p className="text-2xl font-bold">${stats.totalCost.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Bandwidth</p>
                    <p className="text-2xl font-bold">{stats.totalBandwidth.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Network Tab */}
        <TabsContent value="network" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Network Configuration</CardTitle>
              <CardDescription>Network settings assigned to this VM</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">IP Address</p>
                  <p className="text-lg font-mono">{vm.ipAddress || 'Not assigned'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Port</p>
                  <p className="text-lg font-mono">{vm.port ?? 'Not set'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Console Tab */}
        <TabsContent value="console" className="space-y-6">
          <VmTerminal
            vmId={vm.id}
            containerId={vm.dockerContainerId ?? null}
            status={vm.status}
          />
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Container Logs</CardTitle>
                <CardDescription>Latest 200 lines from the VM container</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={loadLogs} disabled={logsLoading}>
                {logsLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm h-96 overflow-y-auto">
                {logsError ? (
                  <p className="text-red-400">Logs unavailable: {logsError}</p>
                ) : logs ? (
                  <pre className="whitespace-pre-wrap">{logs}</pre>
                ) : (
                  <p className="text-gray-500">{logsLoading ? 'Loading logs…' : logsMessage ?? 'No logs available'}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the VM
              &quot;{vm.name}&quot; and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading === 'delete' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
