import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Plan {
    id: string;
    name: string;
    price: number;
}

interface UpgradeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentPlan: Plan;
    newPlan: Plan;
    onConfirm: () => void;
}

export function UpgradeDialog({
    open,
    onOpenChange,
    currentPlan,
    newPlan,
    onConfirm,
}: UpgradeDialogProps) {
    const isUpgrade = newPlan.price > currentPlan.price;
    const priceDiff = Math.abs(newPlan.price - currentPlan.price);

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="animate-scale-in">
                <AlertDialogHeader>
                    <div className="flex items-center gap-2 mb-2">
                        {isUpgrade ? (
                            <TrendingUp className="h-5 w-5 text-green-500" />
                        ) : (
                            <TrendingDown className="h-5 w-5 text-amber-500" />
                        )}
                        <AlertDialogTitle>
                            {isUpgrade ? 'Upgrade' : 'Downgrade'} to {newPlan.name}?
                        </AlertDialogTitle>
                    </div>
                    <AlertDialogDescription>
                        You are {isUpgrade ? 'upgrading' : 'downgrading'} from the{' '}
                        <span className="font-semibold">{currentPlan.name}</span> plan to the{' '}
                        <span className="font-semibold">{newPlan.name}</span> plan.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="py-4 space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                            <p className="text-sm font-medium">Current Plan</p>
                            <p className="text-xs text-muted-foreground">{currentPlan.name}</p>
                        </div>
                        <Badge variant="outline">${currentPlan.price}/mo</Badge>
                    </div>

                    <div className="flex items-center justify-center">
                        {isUpgrade ? (
                            <TrendingUp className="h-6 w-6 text-green-500" />
                        ) : (
                            <TrendingDown className="h-6 w-6 text-amber-500" />
                        )}
                    </div>

                    <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border-2 border-primary">
                        <div>
                            <p className="text-sm font-medium">New Plan</p>
                            <p className="text-xs text-muted-foreground">{newPlan.name}</p>
                        </div>
                        <Badge className="bg-primary">${newPlan.price}/mo</Badge>
                    </div>

                    <div className="text-center pt-2">
                        <p className={`text-sm font-medium ${isUpgrade ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {isUpgrade ? '+' : '-'}${priceDiff.toFixed(2)}/month
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {isUpgrade
                                ? 'Additional monthly charge'
                                : 'Monthly savings'}
                        </p>
                    </div>
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className="transition-all-smooth hover:scale-105"
                    >
                        Confirm {isUpgrade ? 'Upgrade' : 'Downgrade'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
