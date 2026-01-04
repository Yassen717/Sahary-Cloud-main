'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Server,
    Search,
    Filter,
    Play,
    Square,
    Trash2,
    User,
    Activity,
    HardDrive,
    Cpu,
    MoreVertical
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// Mock data for VMs
const mockVMs = [
    {
        id: '1',
        name: 'web-server-01',
        user: 'John Doe',
        userId: 'user1',
        status: 'running',
        cpu: 2,
        ram: 4096,
        storage: 50,
        ipAddress: '192.168.1.10',
        uptime: '15d 8h 23m',
        cpuUsage: 45,
        ramUsage: 78,
        diskUsage: 32,
    },
    {
        id: '2',
        name: 'database-server',
        user: 'Jane Smith',
        userId: 'user2',
        status: 'running',
        cpu: 4,
        ram: 8192,
        storage: 100,
        ipAddress: '192.168.1.11',
        uptime: '30d 12h 05m',
        cpuUsage: 82,
        ramUsage: 91,
        diskUsage: 67,
    },
    {
        id: '3',
        name: 'dev-environment',
        user: 'John Doe',
        userId: 'user1',
        status: 'stopped',
        cpu: 2,
        ram: 2048,
        storage: 30,
        ipAddress: '192.168.1.12',
        uptime: '0d 0h 0m',
        cpuUsage: 0,
        ramUsage: 0,
        diskUsage: 15,
    },
    {
        id: '4',
        name: 'api-gateway',
        user: 'Alice Johnson',
        userId: 'user3',
        status: 'running',
        cpu: 2,
        ram: 4096,
        storage: 40,
        ipAddress: '192.168.1.13',
        uptime: '7d 3h 42m',
        cpuUsage: 34,
        ramUsage: 56,
        diskUsage: 28,
    },
];

export default function AdminVMsPage() {
    const [vms, setVms] = useState(mockVMs);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [userFilter, setUserFilter] = useState('all');

    const filteredVMs = vms.filter(vm => {
        const matchesSearch = vm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vm.user.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || vm.status === statusFilter;
        const matchesUser = userFilter === 'all' || vm.userId === userFilter;
        return matchesSearch && matchesStatus && matchesUser;
    });

    const totalVMs = vms.length;
    const runningVMs = vms.filter(vm => vm.status === 'running').length;
    const stoppedVMs = vms.filter(vm => vm.status === 'stopped').length;
    const avgCpuUsage = vms.reduce((acc, vm) => acc + vm.cpuUsage, 0) / vms.length;

    return (
        <div className="container mx-auto p-6">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">VM Management</h1>
                <p className="text-muted-foreground">Manage all virtual machines across all users</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card className="hover-lift animate-fade-in">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Total VMs</CardTitle>
                            <Server className="h-4 w-4 text-muted-foreground" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalVMs}</div>
                        <p className="text-xs text-muted-foreground mt-1">Across all users</p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-1">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Running</CardTitle>
                            <Activity className="h-4 w-4 text-green-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{runningVMs}</div>
                        <p className="text-xs text-muted-foreground mt-1">Active instances</p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-2">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Stopped</CardTitle>
                            <Square className="h-4 w-4 text-muted-foreground" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stoppedVMs}</div>
                        <p className="text-xs text-muted-foreground mt-1">Inactive instances</p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-3">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Avg CPU Usage</CardTitle>
                            <Cpu className="h-4 w-4 text-blue-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{avgCpuUsage.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground mt-1">Average across VMs</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters and Search */}
            <Card className="mb-6 animate-fade-in stagger-4">
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search VMs by name or user..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-full md:w-[180px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="running">Running</SelectItem>
                                <SelectItem value="stopped">Stopped</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={userFilter} onValueChange={setUserFilter}>
                            <SelectTrigger className="w-full md:w-[180px]">
                                <SelectValue placeholder="User" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Users</SelectItem>
                                <SelectItem value="user1">John Doe</SelectItem>
                                <SelectItem value="user2">Jane Smith</SelectItem>
                                <SelectItem value="user3">Alice Johnson</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* VMs List */}
            <div className="space-y-3">
                {filteredVMs.map((vm, index) => (
                    <Card
                        key={vm.id}
                        className="hover-lift animate-fade-in opacity-0"
                        style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
                    >
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4 flex-1">
                                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <Server className="h-6 w-6 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-semibold text-lg">{vm.name}</h3>
                                            <Badge variant={vm.status === 'running' ? 'default' : 'secondary'}>
                                                {vm.status === 'running' && <span className="h-2 w-2 bg-green-500 rounded-full mr-1 animate-pulse-slow" />}
                                                {vm.status}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                                            <User className="h-3 w-3" />
                                            <span>{vm.user}</span>
                                            <span>•</span>
                                            <span>{vm.ipAddress}</span>
                                            <span>•</span>
                                            <span>{vm.cpu} CPU • {vm.ram}MB RAM • {vm.storage}GB Storage</span>
                                        </div>

                                        {/* Resource Usage */}
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <div className="flex items-center justify-between text-xs mb-1">
                                                    <span className="text-muted-foreground">CPU</span>
                                                    <span className="font-medium">{vm.cpuUsage}%</span>
                                                </div>
                                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-primary transition-all-smooth"
                                                        style={{ width: `${vm.cpuUsage}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between text-xs mb-1">
                                                    <span className="text-muted-foreground">RAM</span>
                                                    <span className="font-medium">{vm.ramUsage}%</span>
                                                </div>
                                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 transition-all-smooth"
                                                        style={{ width: `${vm.ramUsage}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between text-xs mb-1">
                                                    <span className="text-muted-foreground">Disk</span>
                                                    <span className="font-medium">{vm.diskUsage}%</span>
                                                </div>
                                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-amber-500 transition-all-smooth"
                                                        style={{ width: `${vm.diskUsage}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem>
                                            <Play className="h-4 w-4 mr-2" />
                                            Start
                                        </DropdownMenuItem>
                                        <DropdownMenuItem>
                                            <Square className="h-4 w-4 mr-2" />
                                            Stop
                                        </DropdownMenuItem>
                                        <DropdownMenuItem>
                                            <Activity className="h-4 w-4 mr-2" />
                                            View Details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive">
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {filteredVMs.length === 0 && (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Server className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">No VMs found matching your filters</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
