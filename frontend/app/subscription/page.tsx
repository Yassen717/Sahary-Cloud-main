'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    Check,
    X,
    Zap,
    Crown,
    Rocket,
    Calendar,
    CreditCard,
    TrendingUp
} from 'lucide-react';
import { PlanCard } from '@/components/subscription/PlanCard';
import { UpgradeDialog } from '@/components/subscription/UpgradeDialog';
import { useToast } from '@/hooks/use-toast';

const plans = [
    {
        id: 'basic',
        name: 'Basic',
        price: 9.99,
        icon: Zap,
        color: 'text-blue-500',
        features: [
            { name: '1 Virtual Machine', included: true },
            { name: '2 CPU Cores', included: true },
            { name: '4GB RAM', included: true },
            { name: '50GB Storage', included: true },
            { name: '100% Solar Powered', included: true },
            { name: 'Email Support', included: true },
            { name: 'Priority Support', included: false },
            { name: 'Custom Domains', included: false },
        ],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: 49.99,
        icon: Crown,
        color: 'text-primary',
        popular: true,
        features: [
            { name: '5 Virtual Machines', included: true },
            { name: '4 CPU Cores', included: true },
            { name: '16GB RAM', included: true },
            { name: '200GB Storage', included: true },
            { name: '100% Solar Powered', included: true },
            { name: 'Email Support', included: true },
            { name: 'Priority Support', included: true },
            { name: 'Custom Domains', included: true },
            { name: 'Auto Backups', included: true },
        ],
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 199.99,
        icon: Rocket,
        color: 'text-purple-500',
        features: [
            { name: 'Unlimited Virtual Machines', included: true },
            { name: '16 CPU Cores', included: true },
            { name: '64GB RAM', included: true },
            { name: '1TB Storage', included: true },
            { name: '100% Solar Powered', included: true },
            { name: 'Email Support', included: true },
            { name: 'Priority Support', included: true },
            { name: 'Custom Domains', included: true },
            { name: 'Auto Backups', included: true },
            { name: 'Dedicated Support', included: true },
            { name: 'Custom SLA', included: true },
        ],
    },
];

export default function SubscriptionPage() {
    const { toast } = useToast();
    const [currentPlan, setCurrentPlan] = useState('pro');
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
    const [autoRenew, setAutoRenew] = useState(true);
    const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

    const handlePlanChange = (planId: string) => {
        setSelectedPlan(planId);
        setShowUpgradeDialog(true);
    };

    const handleConfirmChange = () => {
        setCurrentPlan(selectedPlan!);
        setShowUpgradeDialog(false);
        toast({
            title: 'Plan Changed Successfully',
            description: `You have been ${selectedPlan === 'basic' ? 'downgraded' : 'upgraded'} to the ${plans.find(p => p.id === selectedPlan)?.name} plan.`,
        });
    };

    const handleToggleAutoRenew = () => {
        setAutoRenew(!autoRenew);
        toast({
            title: autoRenew ? 'Auto-Renewal Disabled' : 'Auto-Renewal Enabled',
            description: autoRenew
                ? 'Your subscription will not renew automatically.'
                : 'Your subscription will renew automatically.',
        });
    };

    const getDiscountedPrice = (price: number) => {
        return billingCycle === 'yearly' ? price * 12 * 0.8 : price;
    };

    const currentPlanData = plans.find(p => p.id === currentPlan);
    const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString();

    return (
        <div className="container mx-auto p-6">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">Subscription Management</h1>
                <p className="text-muted-foreground">Manage your subscription plan and billing preferences</p>
            </div>

            {/* Current Plan Card */}
            <Card className="mb-6 animate-fade-in border-2 border-primary">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                                {currentPlanData && <currentPlanData.icon className="h-6 w-6 text-primary" />}
                            </div>
                            <div>
                                <CardTitle>Current Plan: {currentPlanData?.name}</CardTitle>
                                <CardDescription>
                                    ${getDiscountedPrice(currentPlanData?.price || 0).toFixed(2)}/{billingCycle === 'monthly' ? 'month' : 'year'}
                                </CardDescription>
                            </div>
                        </div>
                        <Badge variant="default" className="animate-pulse-slow">Active</Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium">Next Billing</p>
                                <p className="text-xs text-muted-foreground">{nextBillingDate}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium">Payment Method</p>
                                <p className="text-xs text-muted-foreground">Visa ****1234</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium">Billing Cycle</p>
                                <p className="text-xs text-muted-foreground capitalize">{billingCycle}</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-4 border-t flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Switch
                                id="auto-renew"
                                checked={autoRenew}
                                onCheckedChange={handleToggleAutoRenew}
                            />
                            <Label htmlFor="auto-renew">Auto-renewal enabled</Label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Billing Cycle Toggle */}
            <div className="flex justify-center mb-6 animate-fade-in stagger-1">
                <Card className="inline-flex p-1">
                    <Button
                        variant={billingCycle === 'monthly' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setBillingCycle('monthly')}
                        className="transition-all-smooth"
                    >
                        Monthly
                    </Button>
                    <Button
                        variant={billingCycle === 'yearly' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setBillingCycle('yearly')}
                        className="transition-all-smooth"
                    >
                        Yearly
                        <Badge variant="secondary" className="ml-2 text-xs">Save 20%</Badge>
                    </Button>
                </Card>
            </div>

            {/* Available Plans */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {plans.map((plan, index) => (
                    <PlanCard
                        key={plan.id}
                        plan={{
                            ...plan,
                            price: getDiscountedPrice(plan.price),
                        }}
                        billingCycle={billingCycle}
                        isCurrentPlan={plan.id === currentPlan}
                        onSelect={() => handlePlanChange(plan.id)}
                        delay={index * 100}
                    />
                ))}
            </div>

            {/* Upgrade Dialog */}
            {selectedPlan && (
                <UpgradeDialog
                    open={showUpgradeDialog}
                    onOpenChange={setShowUpgradeDialog}
                    currentPlan={currentPlanData!}
                    newPlan={plans.find(p => p.id === selectedPlan)!}
                    onConfirm={handleConfirmChange}
                />
            )}
        </div>
    );
}
