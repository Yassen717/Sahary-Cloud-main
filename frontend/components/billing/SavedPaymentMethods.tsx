'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, MoreVertical, Check } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

// Mock saved payment methods
const mockPaymentMethods = [
    {
        id: '1',
        type: 'visa',
        last4: '1234',
        expiryMonth: '12',
        expiryYear: '2026',
        isDefault: true,
    },
    {
        id: '2',
        type: 'mastercard',
        last4: '5678',
        expiryMonth: '08',
        expiryYear: '2027',
        isDefault: false,
    },
];

export function SavedPaymentMethods() {
    const { toast } = useToast();
    const [paymentMethods, setPaymentMethods] = useState(mockPaymentMethods);

    const handleSetDefault = (id: string) => {
        setPaymentMethods(methods =>
            methods.map(m => ({ ...m, isDefault: m.id === id }))
        );
        toast({
            title: 'Default Payment Method Updated',
            description: 'Your default payment method has been changed.',
        });
    };

    const handleDelete = (id: string) => {
        setPaymentMethods(methods => methods.filter(m => m.id !== id));
        toast({
            title: 'Payment Method Removed',
            description: 'The payment method has been deleted.',
            variant: 'destructive',
        });
    };

    const getCardIcon = (type: string) => {
        // In a real app, you'd return different card brand icons
        return <CreditCard className="h-6 w-6" />;
    };

    return (
        <div className="space-y-3">
            {paymentMethods.map((method, index) => (
                <Card
                    key={method.id}
                    className={`hover-lift transition-all-smooth animate-fade-in opacity-0 ${method.isDefault ? 'border-2 border-primary' : ''
                        }`}
                    style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
                >
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                    {getCardIcon(method.type)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold capitalize">{method.type}</p>
                                        <span className="text-muted-foreground">•••• {method.last4}</span>
                                        {method.isDefault && (
                                            <Badge variant="default" className="ml-2">
                                                <Check className="h-3 w-3 mr-1" />
                                                Default
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Expires {method.expiryMonth}/{method.expiryYear}
                                    </p>
                                </div>
                            </div>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {!method.isDefault && (
                                        <DropdownMenuItem onClick={() => handleSetDefault(method.id)}>
                                            <Check className="h-4 w-4 mr-2" />
                                            Set as Default
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onClick={() => handleDelete(method.id)}
                                        className="text-destructive"
                                    >
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
