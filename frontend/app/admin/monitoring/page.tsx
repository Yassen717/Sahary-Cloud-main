'use client';

import { useState, useEffect } from 'react';
import { redirect } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { features } from '@/lib/features';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AdminNav } from '@/components/admin/AdminNav';
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Cpu,
    HardDrive,
    Loader2,
    MemoryStick,
    Network
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const REFRESH_INTERVAL_MS = 30000;

type ResourceKey = 'cpu' | 'ram' | 'storage' | 'bandwidth';
type ResourceAmounts = Record<ResourceKey, number>;

interface HealthCheck {
    name: string;
    status: string;
    message?: string;
    error?: string;
    responseTime?: string;
}

interface MonitoringDashboard {
    health: { status: string; checks: HealthCheck[] };
    metrics: {
        requests: { total: number; success: number; errors: number; errorRate: number };
        performance: { avgResponseTime: number; maxResponseTime: number; minResponseTime: number };
    };
}

interface SystemHealth {
    status: string;
    database?: { status: string; responseTime?: string };
    vms?: { status: string; total?: number; running?: number; healthPercentage?: number };
}

interface ResourceUsage {
    used: ResourceAmounts;
    limits: ResourceAmounts;
    usage: ResourceAmounts;
}

const CAPACITY_CARDS: { key: ResourceKey; label: string; unit: string; icon: typeof Cpu; color: string }[] = [
    { key: 'cpu', label: 'CPU Allocation', unit: 'cores', icon: Cpu, color: 'text-primary' },
    { key: 'ram', label: 'Memory Allocation', unit: 'MB', icon: MemoryStick, color: 'text-blue-500' },
    { key: 'storage', label: 'Storage Allocation', unit: 'GB', icon: HardDrive, color: 'text-amber-500' },
    { key: 'bandwidth', label: 'Bandwidth Allocation', unit: 'GB/mo', icon: Network, color: 'text-purple-500' },
];

const isHealthy = (status?: string) => status === 'healthy';

function SystemMonitoringPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
    const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
    const [resources, setResources] = useState<ResourceUsage | null>(null);

    useEffect(() => {
        let active = true;

        const load = () => {
            Promise.all([
                apiClient.getMonitoringDashboard(),
                apiClient.getSystemHealth(),
                apiClient.getSystemResources(),
            ])
                .then(([dashboardResponse, healthResponse, resourcesResponse]) => {
                    if (!active) return;
                    setDashboard(dashboardResponse?.data ?? null);
                    setSystemHealth(healthResponse?.data ?? null);
                    setResources(resourcesResponse?.data ?? null);
                    setUpdatedAt(new Date());
                })
                .catch((error: Error) => {
                    if (active) {
                        toast({
                            title: 'Error',
                            description: error.message || 'Failed to load monitoring data',
                            variant: 'destructive',
                        });
                    }
                })
                .finally(() => {
                    if (active) setLoading(false);
                });
        };

        load();
        const interval = setInterval(load, REFRESH_INTERVAL_MS);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [toast]);

    return (
        <div className="container mx-auto p-6">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">System Monitoring</h1>
                <p className="text-muted-foreground">Monitor platform capacity, service health and request metrics</p>
            </div>

            <AdminNav />

            {loading ? (
                <div className="flex justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            ) : (
                <>
                    {/* Capacity */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {CAPACITY_CARDS.map(({ key, label, unit, icon: Icon, color }) => {
                            const percent = resources?.usage[key] ?? 0;
                            return (
                                <Card key={key} className="hover-lift animate-fade-in">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-sm font-medium">{label}</CardTitle>
                                            <Icon className={`h-4 w-4 ${color}`} />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{resources ? `${percent.toFixed(1)}%` : '—'}</div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {resources
                                                ? `${resources.used[key].toLocaleString()} / ${resources.limits[key].toLocaleString()} ${unit}`
                                                : 'Resource data unavailable'}
                                        </p>
                                        <Progress value={Math.min(100, percent)} className="h-2 mt-2" />
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        {/* Platform */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Platform Status</CardTitle>
                                <CardDescription>Overall system and infrastructure health</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Overall</span>
                                    <Badge variant={isHealthy(systemHealth?.status) ? 'default' : 'destructive'}>
                                        {systemHealth?.status ?? 'unknown'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Database</span>
                                    <span className="font-medium">
                                        {systemHealth?.database?.status ?? 'unknown'}
                                        {systemHealth?.database?.responseTime ? ` • ${systemHealth.database.responseTime}` : ''}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">VMs running</span>
                                    <span className="font-medium">
                                        {systemHealth?.vms?.running ?? '—'} / {systemHealth?.vms?.total ?? '—'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">VM health</span>
                                    <span className="font-medium">
                                        {systemHealth?.vms?.healthPercentage !== undefined
                                            ? `${systemHealth.vms.healthPercentage}%`
                                            : '—'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Requests */}
                        <Card>
                            <CardHeader>
                                <CardTitle>API Requests</CardTitle>
                                <CardDescription>Since the last process start</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Total requests</span>
                                    <span className="font-medium">{dashboard?.metrics.requests.total.toLocaleString() ?? '—'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Error rate</span>
                                    <span className="font-medium">
                                        {dashboard ? `${dashboard.metrics.requests.errorRate}%` : '—'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Avg response time</span>
                                    <span className="font-medium">
                                        {dashboard ? `${dashboard.metrics.performance.avgResponseTime} ms` : '—'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Max response time</span>
                                    <span className="font-medium">
                                        {dashboard ? `${dashboard.metrics.performance.maxResponseTime} ms` : '—'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Health checks */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Service Health Checks</CardTitle>
                                <CardDescription>Dependencies reported by the monitoring service</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {!dashboard || dashboard.health.checks.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No health checks available</p>
                                ) : (
                                    dashboard.health.checks.map((check) => {
                                        const ok = isHealthy(check.status);
                                        const Icon = ok ? CheckCircle2 : AlertCircle;
                                        return (
                                            <div key={check.name} className="flex items-start justify-between gap-3">
                                                <div className="flex items-start gap-2 min-w-0">
                                                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${ok ? 'text-green-500' : 'text-red-500'}`} />
                                                    <div className="min-w-0">
                                                        <p className="font-medium capitalize">{check.name}</p>
                                                        {(check.message || check.error) && (
                                                            <p className="text-xs text-muted-foreground truncate">
                                                                {check.message ?? check.error}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <Badge variant={ok ? 'default' : 'destructive'}>{check.status}</Badge>
                                            </div>
                                        );
                                    })
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Activity className="h-3 w-3" />
                        {updatedAt
                            ? `Last updated ${updatedAt.toLocaleTimeString()} · refreshes every 30 seconds`
                            : 'Refreshes every 30 seconds'}
                    </p>
                </>
            )}
        </div>
    );
}

export default function SystemMonitoringPageGate() {
    // System monitoring covers the VPS fleet; only shown while the VPS feature is enabled.
    if (!features.vps) {
        redirect('/admin/hosting');
    }
    return <SystemMonitoringPage />;
}
