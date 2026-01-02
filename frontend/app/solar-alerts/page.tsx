'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    AlertTriangle,
    AlertCircle,
    Info,
    CheckCircle2,
    Battery,
    Zap,
    Wrench,
    Settings,
    Bell
} from 'lucide-react';
import { AlertCard } from '@/components/solar/AlertCard';
import { AlertSettings } from '@/components/solar/AlertSettings';

// Mock data for alerts
const mockActiveAlerts = [
    {
        id: '1',
        title: 'Low Solar Production',
        message: 'Current production is 30% below expected levels',
        severity: 'warning' as const,
        type: 'LOW_PRODUCTION',
        timestamp: new Date(Date.now() - 30 * 60 * 1000),
        resolved: false,
    },
    {
        id: '2',
        title: 'Battery Level Critical',
        message: 'Battery level has dropped to 15%',
        severity: 'critical' as const,
        type: 'LOW_BATTERY',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        resolved: false,
    },
    {
        id: '3',
        title: 'Maintenance Due',
        message: 'Monthly maintenance is scheduled for tomorrow',
        severity: 'info' as const,
        type: 'MAINTENANCE',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        resolved: false,
    },
];

const mockResolvedAlerts = [
    {
        id: '4',
        title: 'System Normal',
        message: 'All systems have returned to normal operation',
        severity: 'info' as const,
        type: 'SYSTEM_NORMAL',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
        resolved: true,
        resolvedAt: new Date(Date.now() - 22 * 60 * 60 * 1000),
    },
    {
        id: '5',
        title: 'High Temperature Resolved',
        message: 'Panel temperature has returned to normal',
        severity: 'warning' as const,
        type: 'HIGH_TEMP',
        timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000),
        resolved: true,
        resolvedAt: new Date(Date.now() - 46 * 60 * 60 * 1000),
    },
];

export default function SolarAlertsPage() {
    const [activeAlerts, setActiveAlerts] = useState(mockActiveAlerts);
    const [resolvedAlerts, setResolvedAlerts] = useState(mockResolvedAlerts);
    const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

    const handleResolveAlert = (id: string) => {
        const alert = activeAlerts.find(a => a.id === id);
        if (alert) {
            const resolved = { ...alert, resolved: true, resolvedAt: new Date() };
            setActiveAlerts(activeAlerts.filter(a => a.id !== id));
            setResolvedAlerts([resolved, ...resolvedAlerts]);
        }
    };

    const filteredActiveAlerts = filter === 'all'
        ? activeAlerts
        : activeAlerts.filter(alert => alert.severity === filter);

    const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
    const warningCount = activeAlerts.filter(a => a.severity === 'warning').length;

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
                            <CardTitle className="text-sm font-medium">Resolved Today</CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {resolvedAlerts.length}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Issues resolved</p>
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
                        History
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
                                <p className="text-muted-foreground">No resolved alerts yet</p>
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
