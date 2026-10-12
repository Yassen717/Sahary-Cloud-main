'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AdminNav } from '@/components/admin/AdminNav';
import {
    AlertTriangle,
    Battery,
    CheckCircle2,
    Gauge,
    Loader2,
    RefreshCw,
    Sun,
    Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SolarStatus {
    status: string;
    production: number;
    consumption: number;
    efficiency: number;
    batteryLevel: number;
    activeVMs: number;
}

interface SolarAlert {
    id: string;
    type: string;
    severity: string;
    message: string;
    createdAt: string;
}

export default function SolarManagementPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [reloadKey, setReloadKey] = useState(0);
    const [status, setStatus] = useState<SolarStatus | null>(null);
    const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
    const [systemState, setSystemState] = useState<string | null>(null);
    const [alerts, setAlerts] = useState<SolarAlert[]>([]);
    const [collecting, setCollecting] = useState(false);
    const [resolvingId, setResolvingId] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            apiClient.getSolarStatus(),
            apiClient.getSolarBattery(),
            apiClient.getSolarSystemState(),
            apiClient.getSolarAlerts(),
        ])
            .then(([statusResponse, batteryResponse, stateResponse, alertsResponse]) => {
                setStatus(statusResponse?.data ?? null);
                setBatteryLevel(batteryResponse?.data?.level ?? null);
                setSystemState(stateResponse?.data?.state ?? null);
                setAlerts(alertsResponse?.data ?? []);
            })
            .catch((error: Error) => toast({
                title: 'Error',
                description: error.message || 'Failed to load solar data',
                variant: 'destructive',
            }))
            .finally(() => setLoading(false));
    }, [reloadKey, toast]);

    const handleCollect = async () => {
        try {
            setCollecting(true);
            const response = await apiClient.collectSolarData();
            toast(response?.data
                ? { title: 'Solar data collected', description: 'A new reading was recorded.' }
                : { title: 'Collection skipped', description: 'A collection is already in progress.' });
            setReloadKey((key) => key + 1);
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to collect solar data',
                variant: 'destructive',
            });
        } finally {
            setCollecting(false);
        }
    };

    const handleResolve = async (alert: SolarAlert) => {
        try {
            setResolvingId(alert.id);
            await apiClient.resolveSolarAlert(alert.id);
            toast({ title: 'Alert resolved', description: alert.message });
            setReloadKey((key) => key + 1);
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to resolve alert',
                variant: 'destructive',
            });
        } finally {
            setResolvingId(null);
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4 animate-fade-in">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Solar System Management</h1>
                    <p className="text-muted-foreground">Monitor solar production, battery and active alerts</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setReloadKey((key) => key + 1)}
                        aria-label="Refresh solar data"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                    <Button
                        onClick={handleCollect}
                        disabled={collecting}
                        aria-label="Collect solar data now"
                    >
                        {collecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                        Collect now
                    </Button>
                </div>
            </div>

            <AdminNav />

            {loading ? (
                <div className="flex justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            ) : (
                <>
                    {/* System Overview Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <Card className="hover-lift animate-fade-in">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium">Production</CardTitle>
                                    <Sun className="h-4 w-4 text-amber-500" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{status ? `${status.production.toFixed(2)} kWh` : '—'}</div>
                                <p className="text-xs text-muted-foreground mt-1">Latest collection</p>
                            </CardContent>
                        </Card>

                        <Card className="hover-lift animate-fade-in stagger-1">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium">Consumption</CardTitle>
                                    <Zap className="h-4 w-4 text-blue-500" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{status ? `${status.consumption.toFixed(2)} kW` : '—'}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {status ? `${status.activeVMs} running VMs` : 'Estimated from running VMs'}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="hover-lift animate-fade-in stagger-2">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium">Efficiency</CardTitle>
                                    <Gauge className="h-4 w-4 text-green-500" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{status ? `${status.efficiency.toFixed(1)}%` : '—'}</div>
                                <p className="text-xs text-muted-foreground mt-1">Consumption vs. production</p>
                            </CardContent>
                        </Card>

                        <Card className="hover-lift animate-fade-in stagger-3">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium">Battery</CardTitle>
                                    <Battery className="h-4 w-4 text-green-500" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{batteryLevel !== null ? `${batteryLevel}%` : '—'}</div>
                                <p className="text-xs text-muted-foreground mt-1">Current charge level</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <Card className="lg:col-span-1">
                            <CardHeader>
                                <CardTitle>System State</CardTitle>
                                <CardDescription>Current operating state reported by the alert monitor</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">State</span>
                                    <Badge variant={systemState === 'NORMAL' ? 'default' : 'destructive'}>
                                        {systemState ?? 'unknown'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Device status</span>
                                    <span className="font-medium">{status?.status ?? 'unknown'}</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="lg:col-span-2">
                            <CardHeader>
                                <CardTitle>Active Alerts</CardTitle>
                                <CardDescription>
                                    {alerts.length} unresolved alert{alerts.length !== 1 ? 's' : ''}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {alerts.length === 0 ? (
                                    <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        No active alerts
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {alerts.map((alert) => (
                                            <div key={alert.id} className="flex items-center justify-between gap-4 p-4 border rounded-lg">
                                                <div className="flex items-start gap-3 min-w-0">
                                                    <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${alert.severity === 'CRITICAL' ? 'text-red-500' : 'text-amber-500'}`} />
                                                    <div className="min-w-0">
                                                        <p className="font-medium">{alert.message}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            {alert.type} · {new Date(alert.createdAt).toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={resolvingId === alert.id}
                                                    onClick={() => handleResolve(alert)}
                                                    aria-label={`Resolve alert ${alert.type}`}
                                                >
                                                    Resolve
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
