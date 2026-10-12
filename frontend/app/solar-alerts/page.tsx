'use client';

import { useState, useEffect } from 'react';
import { apiClient, ApiError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    AlertCircle,
    Info,
    CheckCircle2,
    Settings,
    Bell,
    Loader2,
    Lock
} from 'lucide-react';
import { AlertCard } from '@/components/solar/AlertCard';
import { AlertSettings } from '@/components/solar/AlertSettings';
import { useToast } from '@/hooks/use-toast';

interface SolarAlertRecord {
    id: string;
    type: string;
    severity: string;
    message: string;
    resolved: boolean;
    createdAt?: string;
    resolvedAt?: string | null;
}

interface CardAlert {
    id: string;
    title: string;
    message: string;
    severity: 'critical' | 'warning' | 'info';
    type: string;
    timestamp: Date;
    resolved: boolean;
    resolvedAt?: Date;
}

const toCardAlert = (record: SolarAlertRecord): CardAlert => ({
    id: record.id,
    title: record.type
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
    message: record.message,
    severity: record.severity === 'CRITICAL' ? 'critical' : record.severity === 'WARNING' ? 'warning' : 'info',
    type: record.type,
    timestamp: new Date(record.createdAt || Date.now()),
    resolved: record.resolved,
    resolvedAt: record.resolvedAt ? new Date(record.resolvedAt) : undefined,
});

export default function SolarAlertsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [activeAlerts, setActiveAlerts] = useState<CardAlert[]>([]);
    const [resolvedAlerts, setResolvedAlerts] = useState<CardAlert[]>([]);
    const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

    useEffect(() => {
        loadAlerts();
    }, []);

    const loadAlerts = async () => {
        try {
            const response = await apiClient.getSolarAlerts();
            setActiveAlerts((response.data ?? []).map(toCardAlert));
            setForbidden(false);
        } catch (error: any) {
            if (error instanceof ApiError && error.status === 403) {
                setForbidden(true);
            } else {
                toast({ title: 'Error', description: error.message || 'Failed to load solar alerts', variant: 'destructive' });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResolveAlert = async (id: string) => {
        const alert = activeAlerts.find(a => a.id === id);
        try {
            await apiClient.resolveSolarAlert(id);
            setActiveAlerts(prev => prev.filter(a => a.id !== id));
            if (alert) {
                setResolvedAlerts(prev => [{ ...alert, resolved: true, resolvedAt: new Date() }, ...prev]);
            }
            toast({ title: 'Alert resolved' });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'Failed to resolve alert', variant: 'destructive' });
        }
    };

    const filteredActiveAlerts = filter === 'all'
        ? activeAlerts
        : activeAlerts.filter(alert => alert.severity === filter);

    const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
    const warningCount = activeAlerts.filter(a => a.severity === 'warning').length;

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (forbidden) {
        return (
            <div className="container mx-auto p-6 max-w-3xl">
                <div className="mb-6 animate-fade-in">
                    <h1 className="text-3xl font-bold mb-2">Solar System Alerts</h1>
                    <p className="text-muted-foreground">Monitor and manage solar system notifications</p>
                </div>
                <Card className="animate-fade-in">
                    <CardContent className="py-16 text-center">
                        <Lock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h2 className="text-lg font-semibold mb-2">Solar alerts are managed by administrators</h2>
                        <p className="text-sm text-muted-foreground max-w-md mx-auto">
                            Alerts from the solar system are only visible to administrators. Your solar production and
                            status are available on the Solar dashboard.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">Solar System Alerts</h1>
                <p className="text-muted-foreground">Monitor and manage solar system notifications</p>
            </div>

            {/* Alert Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="hover-lift animate-fade-in">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                            <Bell className="h-4 w-4 text-muted-foreground" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeAlerts.length}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {criticalCount} critical, {warningCount} warnings
                        </p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-1">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Critical</CardTitle>
                            <AlertCircle className="h-4 w-4 text-red-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {criticalCount}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Require immediate attention</p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-2">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Resolved This Session</CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {resolvedAlerts.length}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Resolved since this page was opened</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs for Active/History/Settings */}
            <Tabs defaultValue="active" className="space-y-4 animate-fade-in stagger-3">
                <TabsList>
                    <TabsTrigger value="active" className="transition-all-smooth">
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Active ({activeAlerts.length})
                    </TabsTrigger>
                    <TabsTrigger value="history" className="transition-all-smooth">
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Resolved This Session
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="transition-all-smooth">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                    </TabsTrigger>
                </TabsList>

                {/* Active Alerts Tab */}
                <TabsContent value="active" className="space-y-4 animate-fade-in">
                    {/* Filter Buttons */}
                    <div className="flex gap-2 flex-wrap">
                        <Button
                            variant={filter === 'all' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilter('all')}
                            className="transition-all-smooth"
                        >
                            All ({activeAlerts.length})
                        </Button>
                        <Button
                            variant={filter === 'critical' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilter('critical')}
                            className="transition-all-smooth"
                        >
                            Critical ({criticalCount})
                        </Button>
                        <Button
                            variant={filter === 'warning' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilter('warning')}
                            className="transition-all-smooth"
                        >
                            Warning ({warningCount})
                        </Button>
                        <Button
                            variant={filter === 'info' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilter('info')}
                            className="transition-all-smooth"
                        >
                            Info
                        </Button>
                    </div>

                    {/* Alert Cards */}
                    {filteredActiveAlerts.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4 animate-pulse-slow" />
                                <p className="text-muted-foreground">No active alerts in this category</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {filteredActiveAlerts.map((alert, index) => (
                                <AlertCard
                                    key={alert.id}
                                    alert={alert}
                                    onResolve={handleResolveAlert}
                                    delay={index * 50}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* History Tab */}
                <TabsContent value="history" className="space-y-4 animate-fade-in">
                    {resolvedAlerts.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Info className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                                <p className="text-muted-foreground">No alerts resolved in this session</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {resolvedAlerts.map((alert, index) => (
                                <AlertCard
                                    key={alert.id}
                                    alert={alert}
                                    delay={index * 50}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings" className="animate-fade-in">
                    <AlertSettings />
                </TabsContent>
            </Tabs>
        </div>
    );
}
