'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Status = 'loading' | 'success' | 'error';

function ReactivateContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const hasParams = !!token && !!email;
  const [status, setStatus] = useState<Status>(hasParams ? 'loading' : 'error');
  const [message, setMessage] = useState(
    hasParams ? '' : 'This reactivation link is incomplete. Please use the link from your email.',
  );
  const requested = useRef(false);

  useEffect(() => {
    if (!token || !email || requested.current) return;
    requested.current = true;

    apiClient
      .reactivateAccount(email, token)
      .then((res) => {
        setStatus('success');
        setMessage(res?.message || 'Your account has been reactivated. You can now log in.');
      })
      .catch((err: Error) => {
        setStatus('error');
        setMessage(err.message || 'This reactivation link is invalid or has expired.');
      });
  }, [token, email]);

  return (
    <Card className="w-full max-w-md mx-4">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-2" aria-hidden="true">
          {status === 'loading' && <Loader2 className="h-12 w-12 animate-spin text-primary" />}
          {status === 'success' && <CheckCircle2 className="h-12 w-12 text-green-600" />}
          {status === 'error' && <XCircle className="h-12 w-12 text-red-600" />}
        </div>
        <CardTitle className="text-2xl font-bold">
          {status === 'loading' && 'Reactivating your account…'}
          {status === 'success' && 'Account reactivated'}
          {status === 'error' && 'Reactivation failed'}
        </CardTitle>
        <CardDescription role="status" aria-live="polite">
          {status === 'loading' ? 'Please wait a moment.' : message}
        </CardDescription>
      </CardHeader>
      {status !== 'loading' && (
        <CardContent className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link href="/login">Go to login</Link>
          </Button>
          {status === 'error' && (
            <Button asChild variant="outline" className="w-full">
              <Link href="/contact">Contact support</Link>
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function ReactivatePage() {
  return (
    <div className="flex items-center justify-center min-h-[70vh] py-12">
      <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}>
        <ReactivateContent />
      </Suspense>
    </div>
  );
}
