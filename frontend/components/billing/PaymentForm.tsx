import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';

export function PaymentForm() {
    return (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
            <Lock className="h-6 w-6 text-muted-foreground" />
            <p className="font-medium">Adding payment methods is not available yet</p>
            <p className="text-sm text-muted-foreground">
                Contact billing support to arrange payment for your invoices.
            </p>
            <Button disabled>Add Payment Method</Button>
        </div>
    );
}
