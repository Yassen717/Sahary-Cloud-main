'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Check, Globe, Loader2, Server } from 'lucide-react';

interface HostingPlan {
    id: string;
    name: string;
    description?: string | null;
    diskGB: number;
    bandwidthGB: number;
    maxDomains: number;
    monthlyPrice: string | number;
}

export default function SubscriptionPage() {
    const { toast } = useToast();
    const [plans, setPlans] = useState<HostingPlan[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadPlans = async () => {
            try {
                const response = await apiClient.getHostingPlans();
                setPlans(response.data ?? []);
            } catch (error: any) {
                toast({ title: 'Error', description: error.message || 'Failed to load plans', variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        };
        loadPlans();
    }, []);

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">Plans</h1>
                <p className="text-muted-foreground">Available plans and where to manage them</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Server className="h-5 w-5 text-primary" />
                            Virtual Machines
                        </CardTitle>
                        <CardDescription>
                            Each VM is created on its own and its cost is based on recorded usage.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex gap-2">
                        <Button asChild>
                            <Link href="/vms/create">Create VM</Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link href="/billing/usage">View usage</Link>
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Globe className="h-5 w-5 text-primary" />
                            Hosting
                        </CardTitle>
                        <CardDescription>
                            Pick a hosting plan and manage your subdomain and custom domains.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild>
                            <Link href="/dashboard/hosting">Manage hosting</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4">
                <h2 className="text-xl font-semibold">Hosting Plans</h2>
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : plans.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center text-muted-foreground">
                            No hosting plans are available right now.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {plans.map((plan) => (
                            <Card key={plan.id} className="flex flex-col">
                                <CardHeader>
                                    <CardTitle>{plan.name}</CardTitle>
                                    <CardDescription>{plan.description}</CardDescription>
                                    <p className="text-2xl font-bold pt-2">
                                        ${Number(plan.monthlyPrice).toFixed(2)}
                                        <span className="text-sm font-normal text-muted-foreground"> / month</span>
                                    </p>
                                </CardHeader>
                                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                                    <ul className="space-y-2 text-sm">
                                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" />{plan.diskGB} GB disk</li>
                                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" />{plan.bandwidthGB} GB bandwidth / month</li>
                                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" />Up to {plan.maxDomains} custom domain(s)</li>
                                    </ul>
                                    <Button asChild className="w-full">
                                        <Link href="/dashboard/hosting">Get started</Link>
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
