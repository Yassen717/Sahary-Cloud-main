'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Search,
    Server,
    FileText,
    AlertCircle,
    Clock,
    X
} from 'lucide-react';

interface SearchResult {
    id: string;
    type: 'vm' | 'invoice' | 'alert';
    title: string;
    description: string;
    metadata?: string;
}

const mockSearchData: SearchResult[] = [
    { id: '1', type: 'vm', title: 'web-server-01', description: '2 CPU, 4GB RAM, Running', metadata: '192.168.1.10' },
    { id: '2', type: 'vm', title: 'database-server', description: '4 CPU, 8GB RAM, Running', metadata: '192.168.1.11' },
    { id: '3', type: 'vm', title: 'dev-environment', description: '2 CPU, 2GB RAM, Stopped', metadata: '192.168.1.12' },
    { id: '4', type: 'invoice', title: 'Invoice #INV-2026-001', description: '$49.99 - Paid', metadata: 'January 2026' },
    { id: '5', type: 'invoice', title: 'Invoice #INV-2025-012', description: '$49.99 - Paid', metadata: 'December 2025' },
    { id: '6', type: 'alert', title: 'Low Solar Production', description: 'Production 30% below expected', metadata: '15 minutes ago' },
    { id: '7', type: 'alert', title: 'Battery Level Critical', description: 'Battery at 15%', metadata: '30 minutes ago' },
];

export default function SearchPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>([
        'web-server',
        'invoice 2026',
        'solar alerts',
    ]);
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        setIsSearching(true);

        if (!query.trim()) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        // Simulate search
        setTimeout(() => {
            const filtered = mockSearchData.filter(item =>
                item.title.toLowerCase().includes(query.toLowerCase()) ||
                item.description.toLowerCase().includes(query.toLowerCase())
            );
            setResults(filtered);
            setIsSearching(false);

            // Add to recent searches
            if (query.trim() && !recentSearches.includes(query.trim())) {
                setRecentSearches(prev => [query.trim(), ...prev.slice(0, 4)]);
            }
        }, 300);
    };

    const handleClearSearch = () => {
        setSearchQuery('');
        setResults([]);
    };

    const handleRecentSearch = (query: string) => {
        setSearchQuery(query);
        handleSearch(query);
    };

    const handleRemoveRecentSearch = (query: string) => {
        setRecentSearches(prev => prev.filter(s => s !== query));
    };

    const getResultIcon = (type: SearchResult['type']) => {
        const icons = {
            vm: { icon: Server, color: 'text-primary', bg: 'bg-primary/10' },
            invoice: { icon: FileText, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
            alert: { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
        };
        return icons[type];
    };

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">Search</h1>
                <p className="text-muted-foreground">Search across VMs, invoices, alerts, and more</p>
            </div>

            {/* Search Bar */}
            <div className="mb-6 animate-fade-in stagger-1">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search for VMs, invoices, alerts..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="pl-12 pr-12 h-14 text-lg transition-all-smooth focus:ring-2 focus:ring-primary"
                    />
                    {searchQuery && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearSearch}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Recent Searches */}
            {!searchQuery && recentSearches.length > 0 && (
                <Card className="mb-6 animate-fade-in stagger-2">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <h3 className="font-semibold">Recent Searches</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {recentSearches.map((search, index) => (
                                <Badge
                                    key={index}
                                    variant="outline"
                                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all-smooth px-3 py-1.5"
                                >
                                    <span onClick={() => handleRecentSearch(search)}>{search}</span>
                                    <X
                                        className="h-3 w-3 ml-2 hover:text-destructive"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveRecentSearch(search);
                                        }}
                                    />
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Search Results */}
            {searchQuery && (
                <div className="space-y-3">
                    {isSearching ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                                <p className="text-muted-foreground">Searching...</p>
                            </CardContent>
                        </Card>
                    ) : results.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Search className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                                <p className="text-muted-foreground font-medium">No results found for "{searchQuery}"</p>
                                <p className="text-sm text-muted-foreground mt-2">Try searching with different keywords</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            <div className="flex items-center justify-between mb-4 animate-fade-in">
                                <p className="text-sm text-muted-foreground">
                                    Found {results.length} result{results.length !== 1 ? 's' : ''} for "{searchQuery}"
                                </p>
                            </div>
                            {results.map((result, index) => {
                                const config = getResultIcon(result.type);
                                const Icon = config.icon;

                                return (
                                    <Card
                                        key={result.id}
                                        className="hover-lift cursor-pointer transition-all-smooth animate-fade-in opacity-0"
                                        style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
                                    >
                                        <CardContent className="pt-6">
                                            <div className="flex items-start gap-4">
                                                <div className={`h-10 w-10 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                                                    <Icon className={`h-5 w-5 ${config.color}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-4 mb-1">
                                                        <h3 className="font-semibold">{result.title}</h3>
                                                        <Badge variant="outline" className="text-xs capitalize flex-shrink-0">
                                                            {result.type}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mb-1">{result.description}</p>
                                                    {result.metadata && (
                                                        <p className="text-xs text-muted-foreground">{result.metadata}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </>
                    )}
                </div>
            )}

            {/* Empty State */}
            {!searchQuery && recentSearches.length === 0 && (
                <Card className="animate-fade-in stagger-2">
                    <CardContent className="py-16 text-center">
                        <Search className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4 animate-float" />
                        <h3 className="text-lg font-semibold mb-2">Start Searching</h3>
                        <p className="text-sm text-muted-foreground max-w-md mx-auto">
                            Search for virtual machines, invoices, alerts, and other resources across your account
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
