'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AdminNav } from '@/components/admin/AdminNav';
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
import {
    Server,
    Search,
    Play,
    Square,
    Trash2,
    User,
    Activity,
    MoreVertical,
    Loader2
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 20;
const STATUS_OPTIONS = ['RUNNING', 'STOPPED', 'STARTING', 'STOPPING', 'RESTARTING', 'ERROR', 'SUSPENDED'];

interface AdminVM {
    id: string;
    name: string;
    status: string;
    cpu: number;
    ram: number;
    storage: number;
    ipAddress: string | null;
    user?: { email: string; firstName: string; lastName: string } | null;
    usageRecords?: { cpuUsage: number; ramUsage: number }[];
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

interface VMCounts {
    total: number;
    running: number;
    stopped: number;
}

export default function AdminVMsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [vms, setVms] = useState<AdminVM[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [counts, setCounts] = useState<VMCounts | null>(null);
    const [page, setPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [reloadKey, setReloadKey] = useState(0);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [vmToDelete, setVmToDelete] = useState<AdminVM | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchTerm.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        apiClient.getStats()
            .then((response) => {
                const vmStats = response?.data?.vms;
                setCounts({
                    total: Number(vmStats?.total ?? 0),
                    running: Number(vmStats?.statusDistribution?.RUNNING ?? 0),
                    stopped: Number(vmStats?.statusDistribution?.STOPPED ?? 0),
                });
            })
            .catch((error: Error) => toast({
                title: 'Error',
                description: error.message || 'Failed to load VM statistics',
                variant: 'destructive',
            }));
    }, [reloadKey, toast]);

    useEffect(() => {
        apiClient.getAllVMs({
            page,
            limit: PAGE_SIZE,
            search: search || undefined,
            status: statusFilter === 'all' ? undefined : statusFilter,
        })
            .then((response) => {
                setVms(response?.data ?? []);
                setPagination(response?.pagination ?? null);
            })
            .catch((error: Error) => toast({
                title: 'Error',
                description: error.message || 'Failed to load VMs',
                variant: 'destructive',
            }))
            .finally(() => setLoading(false));
    }, [page, search, statusFilter, reloadKey, toast]);

    const handleStatusChange = (value: string) => {
        setStatusFilter(value);
        setPage(1);
    };

    const runVmAction = async (vm: AdminVM, action: 'start' | 'stop') => {
        try {
            setBusyId(vm.id);
            await (action === 'start' ? apiClient.startVM(vm.id) : apiClient.stopVM(vm.id));
            toast({
                title: 'Success',
                description: `${action === 'start' ? 'Start' : 'Stop'} requested for ${vm.name}`,
            });
            setReloadKey((key) => key + 1);
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'VM action failed',
                variant: 'destructive',
            });
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async () => {
        if (!vmToDelete) return;

        try {
            setBusyId(vmToDelete.id);
            await apiClient.deleteVM(vmToDelete.id);
            toast({
                title: 'Success',
                description: `${vmToDelete.name} deleted`,
            });
            setVmToDelete(null);
            setReloadKey((key) => key + 1);
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to delete VM',
                variant: 'destructive',
            });
        } finally {
            setBusyId(null);
        }
    };

    const totalVMs = pagination?.total ?? 0;

    return (
        <div className="container mx-auto p-6">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">VM Management</h1>
                <p className="text-muted-foreground">Manage all virtual machines across all users</p>
            </div>

            <AdminNav />

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <Card className="hover-lift animate-fade-in">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Total VMs</CardTitle>
                            <Server className="h-4 w-4 text-muted-foreground" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{counts?.total ?? totalVMs}</div>
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
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{counts?.running ?? '—'}</div>
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
                        <div className="text-2xl font-bold">{counts?.stopped ?? '—'}</div>
                        <p className="text-xs text-muted-foreground mt-1">Inactive instances</p>
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
                                placeholder="Search VMs by name or user email..."
                                aria-label="Search VMs"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={handleStatusChange}>
                            <SelectTrigger className="w-full md:w-[180px]" aria-label="Filter by status">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                {STATUS_OPTIONS.map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {status.charAt(0) + status.slice(1).toLowerCase()}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* VMs List */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            ) : vms.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Server className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">No VMs found matching your filters</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {vms.map((vm, index) => {
                        const latestUsage = vm.usageRecords?.[0];
                        const cpuPercent = latestUsage?.cpuUsage ?? 0;
                        const ramPercent = latestUsage && vm.ram > 0 ? (latestUsage.ramUsage / vm.ram) * 100 : 0;
                        const isRunning = vm.status === 'RUNNING';

                        return (
                            <Card
                                key={vm.id}
                                className="hover-lift animate-fade-in opacity-0"
                                style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
                            >
                                <CardContent className="pt-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <Server className="h-6 w-6 text-primary" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-semibold text-lg">{vm.name}</h3>
                                                    <Badge variant={isRunning ? 'default' : 'secondary'}>
                                                        {isRunning && <span className="h-2 w-2 bg-green-500 rounded-full mr-1 animate-pulse-slow" />}
                                                        {vm.status.toLowerCase()}
                                                    </Badge>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-3">
                                                    <User className="h-3 w-3" />
                                                    <span>{vm.user ? (`${vm.user.firstName} ${vm.user.lastName}`.trim() || vm.user.email) : 'Unknown owner'}</span>
                                                    <span>•</span>
                                                    <span>{vm.ipAddress ?? 'No IP'}</span>
                                                    <span>•</span>
                                                    <span>{vm.cpu} CPU • {vm.ram}MB RAM • {vm.storage}GB Storage</span>
                                                </div>

                                                {latestUsage ? (
                                                    <div className="grid grid-cols-2 gap-4 max-w-md">
                                                        <div>
                                                            <div className="flex items-center justify-between text-xs mb-1">
                                                                <span className="text-muted-foreground">CPU</span>
                                                                <span className="font-medium">{cpuPercent.toFixed(1)}%</span>
                                                            </div>
                                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-primary transition-all-smooth"
                                                                    style={{ width: `${Math.min(100, cpuPercent)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center justify-between text-xs mb-1">
                                                                <span className="text-muted-foreground">RAM</span>
                                                                <span className="font-medium">{ramPercent.toFixed(1)}%</span>
                                                            </div>
                                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-blue-500 transition-all-smooth"
                                                                    style={{ width: `${Math.min(100, ramPercent)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground">No usage recorded yet</p>
                                                )}
                                            </div>
                                        </div>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    disabled={busyId === vm.id}
                                                    aria-label={`Actions for ${vm.name}`}
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    disabled={vm.status !== 'STOPPED'}
                                                    onSelect={() => runVmAction(vm, 'start')}
                                                >
                                                    <Play className="h-4 w-4 mr-2" />
                                                    Start
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    disabled={!isRunning}
                                                    onSelect={() => runVmAction(vm, 'stop')}
                                                >
                                                    <Square className="h-4 w-4 mr-2" />
                                                    Stop
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild>
                                                    <Link href={`/vms/${vm.id}`}>
                                                        <Activity className="h-4 w-4 mr-2" />
                                                        View Details
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    className="text-destructive"
                                                    onSelect={() => setVmToDelete(vm)}
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {pagination && pagination.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Page {pagination.page} of {pagination.totalPages}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            aria-label="Previous page"
                            disabled={page <= 1}
                            onClick={() => setPage(page - 1)}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            aria-label="Next page"
                            disabled={page >= pagination.totalPages}
                            onClick={() => setPage(page + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            <AlertDialog open={!!vmToDelete} onOpenChange={(open) => {
                if (!open) setVmToDelete(null);
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete VM</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete <strong>{vmToDelete?.name}</strong>? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busyId !== null}
                            onClick={(event) => {
                                event.preventDefault();
                                handleDelete();
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {busyId !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
