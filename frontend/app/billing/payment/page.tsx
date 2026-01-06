'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    CreditCard,
    Plus,
    Check,
    X,
    Calendar,
    DollarSign,
    CheckCircle2
} from 'lucide-react';
import { PaymentForm } from '@/components/billing/PaymentForm';
import { SavedPaymentMethods } from '@/components/billing/SavedPaymentMethods';
import { useToast } from '@/hooks/use-toast';

// Mock payment history
const mockPaymentHistory = [
    {
        id: '1',
        date: new Date('2026-01-01'),
        amount: 49.99,
        status: 'success',
        method: 'Visa ****1234',
        description: 'Monthly subscription - Pro Plan',
    },
    {
        id: '2',
        date: new Date('2025-12-01'),
        amount: 49.99,
        status: 'success',
        method: 'Visa ****1234',
        description: 'Monthly subscription - Pro Plan',
    },
    {
        id: '3',
        date: new Date('2025-11-01'),
        amount: 49.99,
        status: 'success',
        method: 'Visa ****1234',
        description: 'Monthly subscription - Pro Plan',
    },
    {
        id: '4',
        date: new Date('2025-10-15'),
        amount: 150.00,
        status: 'success',
        method: 'Mastercard ****5678',
        description: 'VM Upgrade - 4 CPU, 16GB RAM',
    },
];

export default function PaymentPage() {
    const { toast } = useToast();
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [paymentHistory] = useState(mockPaymentHistory);

    const handlePaymentSuccess = () => {
        toast({
            title: 'Payment Method Added',
            description: 'Your payment method has been saved successfully.',
        });
        setShowPaymentForm(false);
    };

    const statusConfig = {
        success: { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', icon: CheckCircle2 },
        pending: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30', icon: Calendar },
        failed: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', icon: X },
    };

    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">Payment Methods</h1>
                <p className="text-muted-foreground">Manage your payment methods and view transaction history</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="hover-lift animate-fade-in">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                            <DollarSign className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${paymentHistory.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Lifetime total</p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-1">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">This Month</CardTitle>
                            <Calendar className="h-4 w-4 text-blue-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${paymentHistory.filter(p => p.date.getMonth() === new Date().getMonth()).reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Monthly spending</p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-2">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">100%</div>
                        <p className="text-xs text-muted-foreground mt-1">All payments successful</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="methods" className="space-y-4 animate-fade-in stagger-3">
                <TabsList>
                    <TabsTrigger value="methods">
                        <CreditCard className="h-4 w-4 mr-2" />
                        Payment Methods
                    </TabsTrigger>
                    <TabsTrigger value="history">
                        <Calendar className="h-4 w-4 mr-2" />
                        Payment History
                    </TabsTrigger>
                </TabsList>

                {/* Payment Methods Tab */}
                <TabsContent value="methods" className="space-y-4">
                    <SavedPaymentMethods />

                    {!showPaymentForm ? (
                        <Card className="border-dashed border-2 hover:border-primary transition-all-smooth">
                            <CardContent className="py-12 text-center">
                                <Button
                                    onClick={() => setShowPaymentForm(true)}
                                    className="transition-all-smooth hover:scale-105"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Payment Method
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="animate-scale-in">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Add Payment Method</CardTitle>
                                        <CardDescription>Enter your card details securely</CardDescription>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowPaymentForm(false)}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <PaymentForm onSuccess={handlePaymentSuccess} />
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* Payment History Tab */}
                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Transaction History</CardTitle>
                            <CardDescription>View all your past payments</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {paymentHistory.map((payment, index) => {
                                    const config = statusConfig[payment.status as keyof typeof statusConfig];
                                    const Icon = config.icon;

                                    return (
                                        <div
                                            key={payment.id}
                                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-all-smooth animate-fade-in opacity-0"
                                            style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
                                        >
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className={`h-10 w-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                                                    <Icon className={`h-5 w-5 ${config.color}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium">{payment.description}</p>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                        <span>{payment.date.toLocaleDateString()}</span>
                                                        <span>•</span>
                                                        <span>{payment.method}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-bold">${payment.amount.toFixed(2)}</p>
                                                <Badge variant={payment.status === 'success' ? 'default' : 'destructive'}>
                                                    {payment.status}
                                                </Badge>
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
