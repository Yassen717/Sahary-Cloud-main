'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Play, Server, Square } from 'lucide-react';

interface VmSummaryItem {
  id: string;
  name: string;
  status: string;
  cpu: number;
  ram: number;
  storage: number;
}

/**
 * VM grid for the dashboard. Only rendered when `features.vps` is enabled —
 * the hosting MVP ships with VPS features flagged off.
 */
export function VmSummary() {
  const { toast } = useToast();
  const [vms, setVms] = useState<VmSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionVmId, setActionVmId] = useState<string | null>(null);

  const loadVms = useCallback(async () => {
    try {
      const res = await apiClient.getVMs();
      setVms((res?.data as VmSummaryItem[] | undefined) ?? []);
    } catch (err) {
      toast({
        title: 'Could not load VMs',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the async load resolves
    void loadVms();
  }, [loadVms]);

  const handleVmAction = async (vm: VmSummaryItem) => {
    try {
      setActionVmId(vm.id);
      if (vm.status === 'RUNNING') {
        await apiClient.stopVM(vm.id);
      } else {
        await apiClient.startVM(vm.id);
      }
      await loadVms();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'VM action failed',
        variant: 'destructive',
      });
    } finally {
      setActionVmId(null);
    }
  };

  const runningVMs = vms.filter((vm) => vm.status === 'RUNNING').length;

  return (
    <Card className="animate-fade-in opacity-0 stagger-3">
      <CardHeader>
        <CardTitle>Your Virtual Machines</CardTitle>
        <CardDescription>
          {vms.length > 0 ? `${runningVMs} running` : 'Manage your VPS instances'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : vms.length === 0 ? (
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
  );
}
