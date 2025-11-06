'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Server, Plus, Search, Grid3x3, List, Play, Square, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'date' | 'status';

interface VM {
  id: string;
  name: string;
  status: string;
  cpu: number;
  ram: number;
  storage: number;
  ipAddress?: string;
  createdAt: string;
}

export default function VMsPage() {
  const [vms, setVms] = useState<VM[]>([]);
  const [filteredVMs, setFilteredVMs] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const { toast } = useToast();

  useEffect(() => {
    loadVMs();
  }, []);

  useEffect(() => {
    filterAndSortVMs();
  }, [vms, searchQuery, statusFilter, sortBy]);

  const loadVMs = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getVMs();
      setVms(response.vms || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load VMs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortVMs = () => {
    let filtered = [...vms];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(vm =>
        vm.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(vm => vm.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'date':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'status':
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    setFilteredVMs(filtered);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
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

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running':
        return <Play className="h-3 w-3 fill-current" />;
      case 'stopped':
        return <Square className="h-3 w-3" />;
      default:
        return <RotateCw className="h-3 w-3" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Virtual Machines</h1>
          <p className="text-muted-foreground">Manage your VPS instances</p>
        </div>
        <Button asChild>
          <Link href="/vms/create">
            <Plus className="mr-2 h-4 w-4" />
            Create VM
          </Link>
        </Button>
      </div>

      {/* Filters and Controls */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search VMs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="stopped">Stopped</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort By */}
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date Created</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>

            {/* View Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('grid')}
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* VMs Display */}
      {filteredVMs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Server className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No VMs Found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first VM to get started'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button asChild>
                <Link href="/vms/create">
                  <Plus className="mr-2 h-4 w-4" />
                  Create VM
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVMs.map((vm) => (
            <Card key={vm.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{vm.name}</CardTitle>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 ${getStatusColor(vm.status)}`}>
                    {getStatusIcon(vm.status)}
                    {vm.status}
                  </span>
                </div>
                <CardDescription>
                  {vm.ipAddress || 'No IP assigned'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">CPU:</span>
                    <span className="font-medium">{vm.cpu} vCPU</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">RAM:</span>
                    <span className="font-medium">{vm.ram} GB</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Storage:</span>
                    <span className="font-medium">{vm.storage} GB</span>
                  </div>
                </div>
                <Button asChild className="w-full">
                  <Link href={`/vms/${vm.id}`}>Manage</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVMs.map((vm) => (
            <Card key={vm.id}>
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4 flex-1">
                  <Server className="h-8 w-8 text-primary" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{vm.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {vm.cpu} vCPU • {vm.ram}GB RAM • {vm.storage}GB Storage
                    </p>
                  </div>
                  <div className="hidden md:block">
                    <p className="text-sm text-muted-foreground">IP Address</p>
                    <p className="font-medium">{vm.ipAddress || 'N/A'}</p>
                  </div>
                  <span className={`px-3 py-1 text-xs rounded-full flex items-center gap-1 ${getStatusColor(vm.status)}`}>
                    {getStatusIcon(vm.status)}
                    {vm.status}
                  </span>
                </div>
                <Button asChild>
                  <Link href={`/vms/${vm.id}`}>Manage</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
