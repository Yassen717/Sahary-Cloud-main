'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PaymentFormProps {
    onSuccess?: () => void;
}

export function PaymentForm({ onSuccess }: PaymentFormProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    const [cardNumber, setCardNumber] = useState('');
    const [cardName, setCardName] = useState('');
    const [expiry, setExpiry] = useState('');
    const [cvv, setCvv] = useState('');

    const formatCardNumber = (value: string) => {
        const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
        const matches = v.match(/\d{4,16}/g);
        const match = (matches && matches[0]) || '';
        const parts = [];

        for (let i = 0, len = match.length; i < len; i += 4) {
            parts.push(match.substring(i, i + 4));
        }

        if (parts.length) {
            return parts.join(' ');
        } else {
            return value;
        }
    };

    const formatExpiry = (value: string) => {
        const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
        if (v.length >= 2) {
            return v.slice(0, 2) + '/' + v.slice(2, 4);
        }
        return v;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        toast({
            title: 'Payment Method Added',
            description: 'Your payment method has been saved securely.',
        });

        setLoading(false);
        onSuccess?.();
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="cardNumber">Card Number</Label>
                <div className="relative">
                    <Input
                        id="cardNumber"
                        placeholder="1234 5678 9012 3456"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                        maxLength={19}
                        required
                        className="pl-10 transition-all-smooth focus:ring-2 focus:ring-primary"
                    />
                    <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="cardName">Cardholder Name</Label>
                <Input
                    id="cardName"
                    placeholder="JOHN DOE"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value.toUpperCase())}
                    required
                    className="transition-all-smooth focus:ring-2 focus:ring-primary"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="expiry">Expiry Date</Label>
                    <Input
                        id="expiry"
                        placeholder="MM/YY"
                        value={expiry}
                        onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                        maxLength={5}
                        required
                        className="transition-all-smooth focus:ring-2 focus:ring-primary"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="cvv">CVV</Label>
                    <div className="relative">
                        <Input
                            id="cvv"
                            type="password"
                            placeholder="123"
                            value={cvv}
                            onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
                            maxLength={4}
                            required
                            className="transition-all-smooth focus:ring-2 focus:ring-primary"
                        />
                        <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    </div>
                </div>
            </div>

            <div className="pt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                <span>Your payment information is encrypted and secure</span>
            </div>

            <Button
                type="submit"
                className="w-full transition-all-smooth hover:scale-105"
                disabled={loading}
            >
                {loading ? 'Processing...' : 'Save Payment Method'}
            </Button>
        </form>
    );
}
