'use client';

import { useState } from 'react';
import { apiClient, ApiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

// Password-reset methods are being added to ApiClient (lib/api.ts); the
// intersection cast keeps this page compiling until that change lands.
const authApi = apiClient as ApiClient & {
  forgotPassword: (email: string) => Promise<any>;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [devToken, setDevToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setDevToken('');
    setLoading(true);

    try {
      const res = await authApi.forgotPassword(email);
      setMessage(
        res?.message ||
          'If an account exists for that email, a password reset link has been sent. Check your email.'
      );
      // Dev affordance: with SMTP unconfigured the backend returns the raw
      // token so the flow can still be exercised.
      if (res?.data?.resetToken) setDevToken(res.data.resetToken);
    } catch (err: any) {
      setError(err?.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Forgot Password
          </CardTitle>
          <CardDescription className="text-center">
            Enter your email and we&apos;ll send you a reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {message && (
              <div className="p-3 text-sm text-green-700 bg-green-50 dark:bg-green-900/20 rounded-md">
                {message}
              </div>
            )}

            {devToken && (
              <div className="p-3 text-sm bg-amber-50 dark:bg-amber-900/20 rounded-md space-y-2">
                <p className="font-medium">
                  Dev mode — no email was sent. Use this reset token:
                </p>
                <code className="block break-all text-xs">{devToken}</code>
                <Link
                  href={`/reset-password?token=${encodeURIComponent(devToken)}`}
                  className="inline-block text-primary underline"
                >
                  Reset password with this token
                </Link>
              </div>
            )}

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
                  Sending...
                </>
              ) : (
                'Send reset link'
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
        </CardContent>
      </Card>
    </div>
  );
}
