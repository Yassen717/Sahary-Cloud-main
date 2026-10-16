import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

export default function HostingOverviewPage() {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-2xl font-semibold leading-none tracking-tight">Hosting Overview</h1>
        <CardDescription>Your hosting account at a glance.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">This section is being built.</p>
      </CardContent>
    </Card>
  );
}
