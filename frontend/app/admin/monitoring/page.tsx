'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
    Activity,
    Cpu,
    HardDrive,
    Network,
    MemoryStick,
    Server,
    AlertCircle,
    CheckCircle2,
    TrendingUp,
    FileText
} from 'lucide-react';

// Mock system data
const mockSystemStats = {
    cpu: { usage: 45, cores: 8, temperature: 62 },
    memory: { used: 12.4, total: 32, percent: 38.75 },
    disk: { used: 245, total: 500, percent: 49 },
    network: { in: 125.4, out: 89.2 },
    uptime: '45d 8h 23m',
    load: [1.2, 1.5, 1.8],
};

const mockLogs = [
    { id: 1, level: 'info', message: 'System health check completed successfully', timestamp: new Date(Date.now() - 5 * 60 * 1000) },
    { id: 2, level: 'warning', message: 'High memory usage detected on VM-12', timestamp: new Date(Date.now() - 15 * 60 * 1000) },
    { id: 3, level: 'error', message: 'Failed to connect to backup server', timestamp: new Date(Date.now() - 30 * 60 * 1000) },
    { id: 4, level: 'info', message: 'Automatic backup completed', timestamp: new Date(Date.now() - 60 * 60 * 1000) },
    { id: 5, level: 'info', message: 'SSL certificate renewed successfully', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    { id: 6, level: 'warning', message: 'Disk usage approaching 50% on main server', timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000) },
];

const mockProcesses = [
    { id: 1, name: 'nginx', cpu: 12.5, memory: 245, status: 'running' },
    { id: 2, name: 'postgresql', cpu: 28.3, memory: 1024, status: 'running' },
    { id: 3, name: 'redis', cpu: 5.2, memory: 128, status: 'running' },
    { id: 4, name: 'node', cpu: 15.8, memory: 512, status: 'running' },
    { id: 5, name: 'docker', cpu: 8.4, memory: 356, status: 'running' },
];

export default function SystemMonitoringPage() {
    const [stats, setStats] = useState(mockSystemStats);
    const [logs, setLogs] = useState(mockLogs);
    const [processes, setProcesses] = useState(mockProcesses);

    // Simulate real-time updates
    useEffect(() => {
        const interval = setInterval(() => {
            setStats(prev => ({
                ...prev,
                cpu: { ...prev.cpu, usage: Math.min(100, Math.max(0, prev.cpu.usage + (Math.random() - 0.5) * 5)) },
            }));
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    const logLevelConfig = {
        info: { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: CheckCircle2 },
        warning: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30', icon: AlertCircle },
        error: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', icon: AlertCircle },
    };

    return (
        <div className="container mx-auto p-6">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">System Monitoring</h1>
                <p className="text-muted-foreground">Monitor server performance and system health</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card className="hover-lift animate-fade-in">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                            <Cpu className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.cpu.usage.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground mt-1">{stats.cpu.cores} cores • {stats.cpu.temperature}°C</p>
                        <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                            <div
                                className="h-full bg-primary transition-all-smooth"
                                style={{ width: `${stats.cpu.usage}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-1">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Memory</CardTitle>
                            <MemoryStick className="h-4 w-4 text-blue-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.memory.percent.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {stats.memory.used}GB / {stats.memory.total}GB
                        </p>
                        <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                            <div
                                className="h-full bg-blue-500 transition-all-smooth"
                                style={{ width: `${stats.memory.percent}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-2">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Disk Usage</CardTitle>
                            <HardDrive className="h-4 w-4 text-amber-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.disk.percent.toFixed(0)}%</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {stats.disk.used}GB / {stats.disk.total}GB
                        </p>
                        <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                            <div
                                className="h-full bg-amber-500 transition-all-smooth"
                                style={{ width: `${stats.disk.percent}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-3">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Network</CardTitle>
                            <Network className="h-4 w-4 text-purple-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-1">
                            <TrendingUp className="h-4 w-4 text-green-500" />
                            <span className="text-lg font-bold">{stats.network.in}</span>
                            <span className="text-xs text-muted-foreground">MB/s</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Upload: {stats.network.out} MB/s
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="space-y-4 animate-fade-in stagger-4">
                <TabsList>
                    <TabsTrigger value="overview">
                        <Activity className="h-4 w-4 mr-2" />
                        Overview
                    </TabsTrigger>
                    <TabsTrigger value="processes">
                        <Server className="h-4 w-4 mr-2" />
                        Processes
                    </TabsTrigger>
                    <TabsTrigger value="logs">
                        <FileText className="h-4 w-4 mr-2" />
                        System Logs
                    </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>System Information</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Uptime</span>
                                    <span className="font-medium">{stats.uptime}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Load Average</span>
                                    <span className="font-medium">{stats.load.join(', ')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Active Processes</span>
                                    <span className="font-medium">{processes.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">CPU Temperature</span>
                                    <span className="font-medium">{stats.cpu.temperature}°C</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Health Status</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">CPU</span>
                                    <Badge variant={stats.cpu.usage > 80 ? 'destructive' : 'default'}>
                                        {stats.cpu.usage > 80 ? 'High' : 'Normal'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Memory</span>
                                    <Badge variant={stats.memory.percent > 80 ? 'destructive' : 'default'}>
                                        {stats.memory.percent > 80 ? 'High' : 'Normal'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Disk</span>
                                    <Badge variant={stats.disk.percent > 80 ? 'destructive' : 'default'}>
                                        {stats.disk.percent > 80 ? 'High' : 'Normal'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Network</span>
                                    <Badge variant="default">Healthy</Badge>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Processes Tab */}
                <TabsContent value="processes">
                    <Card>
                        <CardHeader>
                            <CardTitle>Running Processes</CardTitle>
                            <CardDescription>Top processes by resource usage</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {processes.map((process) => (
                                    <div key={process.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-all-smooth">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                <Server className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                                <p className="font-medium">{process.name}</p>
                                                <p className="text-xs text-muted-foreground">Status: {process.status}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <p className="text-sm font-medium">{process.cpu}%</p>
                                                <p className="text-xs text-muted-foreground">CPU</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-medium">{process.memory}MB</p>
                                                <p className="text-xs text-muted-foreground">Memory</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Logs Tab */}
                <TabsContent value="logs">
                    <Card>
                        <CardHeader>
                            <CardTitle>System Logs</CardTitle>
                            <CardDescription>Recent system events and messages</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {logs.map((log) => {
                                    const config = logLevelConfig[log.level as keyof typeof logLevelConfig];
                                    const Icon = config.icon;

                                    return (
                                        <div key={log.id} className="flex items-start gap-3 p-3 border-l-4 rounded-lg hover:bg-muted/50 transition-all-smooth"
                                            style={{ borderLeftColor: log.level === 'error' ? 'rgb(239, 68, 68)' : log.level === 'warning' ? 'rgb(245, 158, 11)' : 'rgb(59, 130, 246)' }}>
                                            <div className={`h-8 w-8 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                                                <Icon className={`h-4 w-4 ${config.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <Badge variant="outline" className="text-xs">{log.level.toUpperCase()}</Badge>
                                                    <span className="text-xs text-muted-foreground">
                                                        {log.timestamp.toLocaleTimeString()}
                                                    </span>
                                                </div>
                                                <p className="text-sm">{log.message}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
