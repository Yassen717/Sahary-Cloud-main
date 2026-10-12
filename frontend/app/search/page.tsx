'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Search,
    Server,
    FileText,
    LayoutDashboard,
    Loader2,
    X
} from 'lucide-react';

interface SearchResult {
    id: string;
    type: 'vm' | 'invoice' | 'page';
    title: string;
    description: string;
    href: string;
}

const APP_PAGES: SearchResult[] = [
    { id: 'page-dashboard', type: 'page', title: 'Dashboard', description: 'Overview of your VMs and solar system', href: '/dashboard' },
    { id: 'page-vms', type: 'page', title: 'VMs', description: 'Manage your virtual machines', href: '/vms' },
    { id: 'page-create-vm', type: 'page', title: 'Create VM', description: 'Deploy a new virtual machine', href: '/vms/create' },
    { id: 'page-solar', type: 'page', title: 'Solar', description: 'Solar production and environmental impact', href: '/solar' },
    { id: 'page-billing', type: 'page', title: 'Billing', description: 'Invoices and payments', href: '/billing' },
    { id: 'page-usage', type: 'page', title: 'Usage', description: 'Resource usage and costs', href: '/billing/usage' },
    { id: 'page-hosting', type: 'page', title: 'Hosting', description: 'Domains and hosting account', href: '/dashboard/hosting' },
    { id: 'page-help', type: 'page', title: 'Help', description: 'Help and documentation', href: '/help' },
    { id: 'page-profile', type: 'page', title: 'Profile', description: 'Your account profile', href: '/profile' },
    { id: 'page-settings', type: 'page', title: 'Settings', description: 'Account settings', href: '/settings' },
];

const resultIcons = {
    vm: { icon: Server, color: 'text-primary', bg: 'bg-primary/10' },
    invoice: { icon: FileText, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
    page: { icon: LayoutDashboard, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
};

function SearchContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState(searchParams.get('q') ?? '');
    const [debouncedQuery, setDebouncedQuery] = useState(query.trim());
    const [items, setItems] = useState<SearchResult[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [dataError, setDataError] = useState('');

    useEffect(() => {
        let cancelled = false;
        const loadData = async () => {
            const [vmsResult, invoicesResult] = await Promise.allSettled([
                apiClient.getVMs(),
                apiClient.getInvoices({ limit: 50 }),
            ]);
            if (cancelled) return;

            const next: SearchResult[] = [];
            if (vmsResult.status === 'fulfilled') {
                for (const vm of vmsResult.value.data ?? []) {
                    next.push({
                        id: `vm-${vm.id}`,
                        type: 'vm',
                        title: vm.name,
                        description: `${vm.cpu} vCPU • ${vm.ram / 1024} GB RAM • ${vm.status}`,
                        href: `/vms/${vm.id}`,
                    });
                }
            }
            if (invoicesResult.status === 'fulfilled') {
                for (const invoice of invoicesResult.value.data ?? []) {
                    next.push({
                        id: `invoice-${invoice.id}`,
                        type: 'invoice',
                        title: `Invoice ${invoice.invoiceNumber}`,
                        description: `$${Number(invoice.amount).toFixed(2)} • ${invoice.status}`,
                        href: `/billing/${invoice.id}`,
                    });
                }
            }

            setItems(next);
            setDataError(
                vmsResult.status === 'rejected' || invoicesResult.status === 'rejected'
                    ? 'Some results could not be loaded'
                    : '',
            );
            setDataLoading(false);
        };
        loadData();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        const params = debouncedQuery ? `?q=${encodeURIComponent(debouncedQuery)}` : '';
        router.replace(`/search${params}`, { scroll: false });
    }, [debouncedQuery, router]);

    const results = useMemo(() => {
        const needle = debouncedQuery.toLowerCase();
        if (!needle) return [];
        return [...items, ...APP_PAGES].filter((item) =>
            `${item.title} ${item.description}`.toLowerCase().includes(needle),
        );
    }, [items, debouncedQuery]);

    const isSearching = query.trim() !== debouncedQuery;

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">Search</h1>
                <p className="text-muted-foreground">Search across your VMs, invoices, and app pages</p>
            </div>

            {/* Search Bar */}
            <div className="mb-6 animate-fade-in stagger-1">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        type="text"
                        aria-label="Search"
                        placeholder="Search for VMs, invoices, pages..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-12 pr-12 h-14 text-lg transition-all-smooth focus:ring-2 focus:ring-primary"
                    />
                    {query && (
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Clear search"
                            onClick={() => setQuery('')}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                    )}
                </div>
                {dataError && <p className="text-sm text-destructive mt-2">{dataError}</p>}
            </div>

            {!debouncedQuery && (
                <Card className="animate-fade-in stagger-2">
                    <CardContent className="py-16 text-center">
                        <Search className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4 animate-float" />
                        <h3 className="text-lg font-semibold mb-2">Start Searching</h3>
                        <p className="text-sm text-muted-foreground max-w-md mx-auto">
                            {dataLoading
                                ? 'Loading your VMs and invoices…'
                                : 'Search for virtual machines, invoices, and pages in the app'}
                        </p>
                    </CardContent>
                </Card>
            )}

            {debouncedQuery && (
                <div className="space-y-3">
                    {isSearching ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-4" />
                                <p className="text-muted-foreground">Searching...</p>
                            </CardContent>
                        </Card>
                    ) : results.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Search className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                                <p className="text-muted-foreground font-medium">No results found for &quot;{debouncedQuery}&quot;</p>
                                <p className="text-sm text-muted-foreground mt-2">Try searching with different keywords</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            <div className="flex items-center justify-between mb-4 animate-fade-in">
                                <p className="text-sm text-muted-foreground">
                                    Found {results.length} result{results.length !== 1 ? 's' : ''} for &quot;{debouncedQuery}&quot;
                                </p>
                            </div>
                            {results.map((result, index) => {
                                const config = resultIcons[result.type];
                                const Icon = config.icon;

                                return (
                                    <Link key={result.id} href={result.href} className="block">
                                        <Card
                                            className="hover-lift cursor-pointer transition-all-smooth animate-fade-in opacity-0"
                                            style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
                                        >
                                            <CardContent className="pt-6">
                                                <div className="flex items-start gap-4">
                                                    <div className={`h-10 w-10 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                                                        <Icon className={`h-5 w-5 ${config.color}`} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-4 mb-1">
                                                            <h3 className="font-semibold">{result.title}</h3>
                                                            <Badge variant="outline" className="text-xs capitalize shrink-0">
                                                                {result.type}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground">{result.description}</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                );
                            })}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default function SearchPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-screen">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            }
        >
            <SearchContent />
        </Suspense>
    );
}
