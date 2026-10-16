import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

export default function HostingDatabasesPage() {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-2xl font-semibold leading-none tracking-tight">Databases</h1>
        <CardDescription>Manage the MySQL databases of your hosting account.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">This section is being built.</p>
      </CardContent>
    </Card>
  );
}
