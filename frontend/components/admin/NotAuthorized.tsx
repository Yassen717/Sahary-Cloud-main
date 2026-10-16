import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldX } from 'lucide-react';

interface NotAuthorizedProps {
  message?: string;
}

/** Friendly state shown when an admin API answers 403. */
export function NotAuthorized({ message }: NotAuthorizedProps) {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <ShieldX className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <CardTitle>Not authorized</CardTitle>
        <CardDescription>
          {message ?? 'You do not have permission to view hosting administration.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
