import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, LucideIcon } from 'lucide-react';

interface Plan {
    id: string;
    name: string;
    price: number;
    icon: LucideIcon;
    color: string;
    features: { name: string; included: boolean }[];
    popular?: boolean;
}

interface PlanCardProps {
    plan: Plan;
    billingCycle: 'monthly' | 'yearly';
    isCurrentPlan: boolean;
    onSelect: () => void;
    delay?: number;
}

export function PlanCard({ plan, billingCycle, isCurrentPlan, onSelect, delay = 0 }: PlanCardProps) {
    const Icon = plan.icon;

    return (
        <Card
            className={`relative hover-lift animate-fade-in opacity-0 ${plan.popular ? 'border-2 border-primary' : ''
                } ${isCurrentPlan ? 'bg-primary/5' : ''}`}
            style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
        >
            {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="animate-pulse-slow">Most Popular</Badge>
                </div>
            )}

            <CardHeader>
                <div className="flex items-center justify-between mb-4">
                    <div className={`h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center ${plan.color}`}>
                        <Icon className="h-6 w-6" />
                    </div>
                    {isCurrentPlan && (
                        <Badge variant="outline" className="bg-primary/10 text-primary">
                            Current Plan
                        </Badge>
                    )}
                </div>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>
                    <div className="mt-2">
                        <span className="text-3xl font-bold text-foreground">
                            ${plan.price.toFixed(2)}
                        </span>
                        <span className="text-muted-foreground">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                    </div>
                    {billingCycle === 'yearly' && (
                        <p className="text-xs text-primary mt-1">Billed annually - Save 20%</p>
                    )}
                </CardDescription>
            </CardHeader>

            <CardContent>
                <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                            {feature.included ? (
                                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            ) : (
                                <X className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            )}
                            <span className={`text-sm ${!feature.included ? 'text-muted-foreground line-through' : ''}`}>
                                {feature.name}
                            </span>
                        </li>
                    ))}
                </ul>

                <Button
                    onClick={onSelect}
                    disabled={isCurrentPlan}
                    className="w-full transition-all-smooth hover:scale-105"
                    variant={plan.popular ? 'default' : 'outline'}
                >
                    {isCurrentPlan ? 'Current Plan' : 'Select Plan'}
                </Button>
            </CardContent>
        </Card>
    );
}
