'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient, ApiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S+$/;

// Password-reset methods are being added to ApiClient (lib/api.ts); the
// intersection cast keeps this page compiling until that change lands.
const authApi = apiClient as ApiClient & {
  resetPassword: (
    token: string,
    password: string,
    confirmPassword: string
  ) => Promise<any>;
};

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!PASSWORD_REGEX.test(password)) {
      setError(
        'Min 8 characters with uppercase, lowercase, number & special character'
      );
      return;
    }

    setLoading(true);

    try {
      await authApi.resetPassword(token as string, password, confirmPassword);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Password reset failed. The link may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Reset Password
          </CardTitle>
          <CardDescription className="text-center">
            Enter your new password
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token && (
            <div className="space-y-4">
              <div
                className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-md"
                role="alert"
              >
                This password reset link is invalid or missing its token.
              </div>
              <Button asChild className="w-full">
                <Link href="/forgot-password">Request a new reset link</Link>
              </Button>
            </div>
          )}

          {token && success && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-4">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
                <p className="text-sm text-center">
                  Your password has been reset successfully.
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href="/login">Back to login</Link>
              </Button>
            </div>
          )}

          {token && !success && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Min 8 characters with uppercase, lowercase, number &amp;
                  special character
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div
                  className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-md"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Reset password'
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
