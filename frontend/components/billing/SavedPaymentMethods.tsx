import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SavedPaymentMethods() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Saved Payment Methods</CardTitle>
                <CardDescription>Cards you save for future payments</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
                Saved payment methods are not available yet.
            </CardContent>
        </Card>
    );
}
