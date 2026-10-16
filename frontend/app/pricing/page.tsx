import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

export default function PricingPage() {
  return (
    <div className="container mx-auto max-w-3xl p-6">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Pricing</h1>
          <CardDescription>Hosting plans and pricing.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">This section is being built.</p>
        </CardContent>
      </Card>
    </div>
  );
}
