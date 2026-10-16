import { AdminNav } from '@/components/admin/AdminNav';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

export default function AdminHostingPage() {
  return (
    <div className="container mx-auto max-w-5xl p-6">
      <AdminNav />
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Hosting Administration</h1>
          <CardDescription>Manage hosting accounts, plans and health.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">This section is being built.</p>
        </CardContent>
      </Card>
    </div>
  );
}
