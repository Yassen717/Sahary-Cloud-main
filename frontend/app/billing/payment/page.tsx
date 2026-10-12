'use client';

import { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BillingNav } from '@/components/billing/BillingNav';
import { PaymentForm } from '@/components/billing/PaymentForm';
import { SavedPaymentMethods } from '@/components/billing/SavedPaymentMethods';
import {
    CreditCard,
    Calendar,
    CheckCircle2,
    DollarSign,
    Loader2,
    X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 10;

type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

interface Payment {
    id: string;
    amount: number | string;
    method: string;
    status: PaymentStatus;
    createdAt: string;
    invoice?: { invoiceNumber: string } | null;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

interface PaymentStats {
    counts: { total: number; completed: number; pending: number; failed: number; refunded: number };
    amounts: { totalProcessed: number };
}

const statusConfig: Record<PaymentStatus, { label: string; color: string; bg: string; icon: LucideIcon }> = {
    COMPLETED: { label: 'Completed', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', icon: CheckCircle2 },
    PENDING: { label: 'Pending', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30', icon: Calendar },
    FAILED: { label: 'Failed', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', icon: X },
    REFUNDED: { label: 'Refunded', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: DollarSign },
};

export default function PaymentPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [page, setPage] = useState(1);
    const [stats, setStats] = useState<PaymentStats | null>(null);

    useEffect(() => {
        apiClient.getPaymentStats()
            .then((response) => setStats(response?.data ?? null))
            .catch((error: Error) => toast({
                title: 'Error',
                description: error.message || 'Failed to load payment statistics',
                variant: 'destructive',
            }));
    }, [toast]);

    useEffect(() => {
        apiClient.getPayments({ page, limit: PAGE_SIZE })
            .then((response) => {
                setPayments(response?.data ?? []);
                setPagination(response?.pagination ?? null);
            })
            .catch((error: Error) => toast({
                title: 'Error',
                description: error.message || 'Failed to load payments',
                variant: 'destructive',
            }))
            .finally(() => setLoading(false));
    }, [page, toast]);

    const goToPage = (nextPage: number) => {
        setLoading(true);
        setPage(nextPage);
    };

    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">Payment History</h1>
                <p className="text-muted-foreground">View your payments and manage payment methods</p>
            </div>

            <BillingNav />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="hover-lift animate-fade-in">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                            <DollarSign className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${stats ? Number(stats.amounts.totalProcessed).toFixed(2) : '—'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Completed payments, all time</p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-1">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Completed</CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats ? stats.counts.completed : '—'}</div>
                        <p className="text-xs text-muted-foreground mt-1">Successful payments</p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-2">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Pending</CardTitle>
                            <Calendar className="h-4 w-4 text-amber-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats ? stats.counts.pending : '—'}</div>
                        <p className="text-xs text-muted-foreground mt-1">Awaiting confirmation</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="history" className="space-y-4 animate-fade-in stagger-3">
                <TabsList>
                    <TabsTrigger value="history">
                        <Calendar className="h-4 w-4 mr-2" />
                        Payment History
                    </TabsTrigger>
                    <TabsTrigger value="methods">
                        <CreditCard className="h-4 w-4 mr-2" />
                        Payment Methods
                    </TabsTrigger>
                </TabsList>

                {/* Payment History Tab */}
                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Transaction History</CardTitle>
                            <CardDescription>View all your past payments</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin" />
                                </div>
                            ) : payments.length === 0 ? (
                                <p className="py-12 text-center text-muted-foreground">No payments yet</p>
                            ) : (
                                <div className="space-y-3">
                                    {payments.map((payment) => {
                                        const config = statusConfig[payment.status];
                                        const Icon = config.icon;
                                        const badgeVariant = payment.status === 'COMPLETED'
                                            ? 'default'
                                            : payment.status === 'FAILED' ? 'destructive' : 'secondary';

                                        return (
                                            <div
                                                key={payment.id}
                                                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-all-smooth"
                                            >
                                                <div className="flex items-center gap-4 flex-1">
                                                    <div className={`h-10 w-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                                                        <Icon className={`h-5 w-5 ${config.color}`} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium">
                                                            {payment.invoice?.invoiceNumber ? `Invoice ${payment.invoice.invoiceNumber}` : 'Payment'}
                                                        </p>
                                                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                            <span>{new Date(payment.createdAt).toLocaleDateString()}</span>
                                                            <span>•</span>
                                                            <span>{payment.method}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-bold">${Number(payment.amount).toFixed(2)}</p>
                                                    <Badge variant={badgeVariant}>{config.label}</Badge>
                                                </div>
                                            </div>
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
                                            onClick={() => goToPage(page - 1)}
                                        >
                                            Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            aria-label="Next page"
                                            disabled={page >= pagination.totalPages}
                                            onClick={() => goToPage(page + 1)}
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Payment Methods Tab */}
                <TabsContent value="methods" className="space-y-4">
                    <SavedPaymentMethods />
                    <PaymentForm />
                </TabsContent>
            </Tabs>
        </div>
    );
}
