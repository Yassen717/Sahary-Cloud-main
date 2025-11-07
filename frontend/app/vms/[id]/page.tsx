'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  Network,
  Activity,
  Clock,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
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
  ipAddress?: string;
  os?: string;
  createdAt: string;
  updatedAt: string;
}

interface VMStats {
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  networkIn: number;
  networkOut: number;
  uptime: number;
}

export default function VMDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [vm, setVm] = useState<VM | null>(null);
  const [stats, setStats] = useState<VMStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    loadVMDetails();
    // Refresh stats every 30 seconds
    const interval = setInterval(loadVMDetails, 30000);
    return () => clearInterval(interval);
  }, [params.id]);

  const loadVMDetails = async () => {
    try {
      const response = await apiClient.getVM(params.id as string);
      setVm(response.vm);
      // Mock stats for now - replace with actual API call when available
      setStats({
        cpuUsage: Math.random() * 100,
        ramUsage: Math.random() * 100,
        diskUsage: Math.random() * 100,
        networkIn: Math.random() * 1000,
        networkOut: Math.random() * 1000,
        uptime: Math.floor(Math.random() * 86400),
      });
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

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes.toFixed(2)} B/s`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB/s`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB/s`;
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
              disabled={vm.status === 'running' || actionLoading !== null}
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
              disabled={vm.status === 'stopped' || actionLoading !== null}
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
              disabled={vm.status !== 'running' || actionLoading !== null}
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

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
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
                {stats && (
                  <p className="text-xs text-muted-foreground">
                    {stats.cpuUsage.toFixed(1)}% usage
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">RAM</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vm.ram} GB</div>
                {stats && (
                  <p className="text-xs text-muted-foreground">
                    {stats.ramUsage.toFixed(1)}% usage
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Storage</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vm.storage} GB</div>
                {stats && (
                  <p className="text-xs text-muted-foreground">
                    {stats.diskUsage.toFixed(1)}% usage
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats ? formatUptime(stats.uptime) : 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Since last restart
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
                  <p className="text-sm font-medium text-muted-foreground">Operating System</p>
                  <p className="text-sm">{vm.os || 'Ubuntu 22.04 LTS'}</p>
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
              <CardDescription>Real-time resource utilization metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {stats && (
                <>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">CPU Usage</span>
                      <span className="text-sm text-muted-foreground">{stats.cpuUsage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${stats.cpuUsage}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">RAM Usage</span>
                      <span className="text-sm text-muted-foreground">{stats.ramUsage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${stats.ramUsage}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">Disk Usage</span>
                      <span className="text-sm text-muted-foreground">{stats.diskUsage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${stats.diskUsage}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Network Traffic</CardTitle>
              <CardDescription>Current network throughput</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Network className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Incoming</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {stats ? formatBytes(stats.networkIn) : 'N/A'}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Network className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Outgoing</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {stats ? formatBytes(stats.networkOut) : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Network Tab */}
        <TabsContent value="network" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Network Configuration</CardTitle>
              <CardDescription>Network settings and connectivity information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Public IP Address</p>
                  <p className="text-lg font-mono">{vm.ipAddress || 'Not assigned'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Private IP Address</p>
                  <p className="text-lg font-mono">10.0.0.{Math.floor(Math.random() * 255)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Gateway</p>
                  <p className="text-lg font-mono">10.0.0.1</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">DNS Servers</p>
                  <p className="text-lg font-mono">8.8.8.8, 8.8.4.4</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open Ports</CardTitle>
              <CardDescription>Currently configured firewall rules</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">SSH</p>
                    <p className="text-sm text-muted-foreground">Port 22</p>
                  </div>
                  <Badge>Open</Badge>
                </div>
                <div className="flex justify-between items-center p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">HTTP</p>
                    <p className="text-sm text-muted-foreground">Port 80</p>
                  </div>
                  <Badge>Open</Badge>
                </div>
                <div className="flex justify-between items-center p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">HTTPS</p>
                    <p className="text-sm text-muted-foreground">Port 443</p>
                  </div>
                  <Badge>Open</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Logs</CardTitle>
              <CardDescription>Recent system events and logs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm h-96 overflow-y-auto">
                <p>[{new Date().toISOString()}] VM started successfully</p>
                <p>[{new Date().toISOString()}] Network interface initialized</p>
                <p>[{new Date().toISOString()}] SSH service started on port 22</p>
                <p>[{new Date().toISOString()}] System ready</p>
                <p className="text-gray-500">...</p>
                <p className="text-gray-500">Waiting for new events...</p>
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
              "{vm.name}" and all associated data.
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
