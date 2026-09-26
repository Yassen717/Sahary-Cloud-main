'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient, ApiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';

// Email-verification methods are being added to ApiClient (lib/api.ts);
// the intersection cast keeps this page compiling until that change lands.
const authApi = apiClient as ApiClient & {
  verifyEmail: (token: string) => Promise<any>;
  resendVerification: (email: string) => Promise<any>;
};

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  // Guards against React StrictMode's double effect invocation firing
  // the (potentially single-use) token verification twice in dev.
  const attemptedRef = useRef(false);

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>(
    token ? 'verifying' : 'idle'
  );
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState('');
  const [devToken, setDevToken] = useState('');

  useEffect(() => {
    if (!token || attemptedRef.current) return;
    attemptedRef.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: any) => {
        setError(
          err?.message || 'Verification link is invalid or has expired.'
        );
        setStatus('error');
      });
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendError('');
    setResendMessage('');
    setDevToken('');
    setResendLoading(true);

    try {
      const res = await authApi.resendVerification(email);
      setResendMessage(
        res?.message || 'Verification email sent — please check your inbox.'
      );
      // Dev affordance: with SMTP unconfigured the backend returns the raw
      // token so the flow can still be exercised.
      const token = res?.data?.verificationToken ?? res?.data?.resetToken;
      if (token) setDevToken(token);
    } catch (err: any) {
      setResendError(err?.message || 'Failed to resend verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Verify Email
          </CardTitle>
          <CardDescription className="text-center">
            {status === 'verifying'
              ? 'Verifying your email address...'
              : 'Confirm your email address to unlock all features'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'verifying' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Verifying your email...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-4">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
                <p className="text-sm text-center">
                  Your email has been verified successfully.
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
              <div className="text-center text-sm">
                <Link
                  href="/login"
                  className="text-muted-foreground hover:underline"
                >
                  Back to login
                </Link>
              </div>
            </div>
          )}

          {(status === 'idle' || status === 'error') && (
            <form onSubmit={handleResend} className="space-y-4">
              {status === 'error' && (
                <div
                  className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-md"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Enter your email to receive a new verification link.
              </p>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={resendLoading}
                />
              </div>

              {resendMessage && (
                <div className="p-3 text-sm text-green-700 bg-green-50 dark:bg-green-900/20 rounded-md">
                  {resendMessage}
                </div>
              )}

              {devToken && (
                <div className="p-3 text-sm bg-amber-50 dark:bg-amber-900/20 rounded-md space-y-2">
                  <p className="font-medium">
                    Dev mode — no email was sent. Use this verification token:
                  </p>
                  <code className="block break-all text-xs">{devToken}</code>
                  <Link
                    href={`/verify-email?token=${encodeURIComponent(devToken)}`}
                    className="inline-block text-primary underline"
                  >
                    Verify with this token
                  </Link>
                </div>
              )}

              {resendError && (
                <div
                  className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-md"
                  role="alert"
                >
                  {resendError}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={resendLoading}>
                {resendLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Resend verification email'
                )}
              </Button>

              <div className="text-center text-sm">
                <Link
                  href="/login"
                  className="text-muted-foreground hover:underline"
                >
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  );
}
