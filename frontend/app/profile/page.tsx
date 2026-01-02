'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, User, Lock, Activity, Mail, CheckCircle2, Clock, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Profile form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Password form state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    // Try to use the auth context first
    const checkAuth = async () => {
      try {
        // Check if we have a token
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

        if (!token) {
          setAuthError('You need to be logged in to view this page');
          setAuthLoading(false);
          return;
        }

        // Try to get user info from the API
        try {
          const response = await apiClient.getMe();
          const userData = response.data || response.user || response;

          setCurrentUser(userData);
          setName(userData.name || userData.firstName + ' ' + userData.lastName || '');
          setEmail(userData.email || '');
          setAuthLoading(false);
        } catch (apiError: any) {
          // If API fails, show error
          setAuthError(apiError.message || 'Failed to load profile');
          setAuthLoading(false);
        }
      } catch (error: any) {
        setAuthError(error.message || 'Authentication error');
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    try {
      await apiClient.updateProfile({ name, email });
      setSaved(true);
      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });

      // Reset saved state after animation
      setTimeout(() => setSaved(false), 2000);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: 'Error',
        description: 'Password must be at least 8 characters',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      await apiClient.changePassword(oldPassword, newPassword);
      toast({
        title: 'Success',
        description: 'Password changed successfully',
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to change password',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (authError || !currentUser) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card className="animate-fade-in border-amber-500">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <LogIn className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle>Authentication Required</CardTitle>
                <CardDescription>{authError || 'Please log in to view your profile'}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You need to be logged in to access your profile page. Please log in or create an account to continue.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => router.push('/login')}
                className="transition-all-smooth hover:scale-105"
              >
                Go to Login
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push('/register')}
                className="transition-all-smooth hover:scale-105"
              >
                Create Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6 animate-fade-in">
        <h1 className="text-3xl font-bold">Profile Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      {/* Profile Header Card */}
      <div className="relative overflow-hidden rounded-lg border bg-card mb-8 animate-fade-in stagger-1">
        <div className="absolute inset-0 gradient-green-subtle opacity-50"></div>
        <div className="relative flex items-center gap-6 p-6">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-green-500 rounded-full blur opacity-75 group-hover:opacity-100 transition-all-smooth animate-pulse-slow"></div>
            <Avatar className="h-24 w-24 relative border-4 border-background transition-all-smooth group-hover:scale-110">
              <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.name || currentUser.email}`} />
              <AvatarFallback className="bg-primary text-primary-foreground text-3xl font-bold">
                {getInitials(currentUser.name || currentUser.email)}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-semibold">{currentUser.name || 'User'}</h2>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <Mail className="h-4 w-4" />
              {currentUser.email}
            </p>
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                {currentUser.role || 'USER'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="profile" className="space-y-6 animate-fade-in stagger-2">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" className="transition-all-smooth">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="password" className="transition-all-smooth">
            <Lock className="h-4 w-4 mr-2" />
            Password
          </TabsTrigger>
          <TabsTrigger value="activity" className="transition-all-smooth">
            <Activity className="h-4 w-4 mr-2" />
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="animate-fade-in">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={loading}
                    className="transition-all-smooth focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="transition-all-smooth focus:ring-2 focus:ring-primary"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="transition-all-smooth hover:scale-105 relative"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : saved ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4 animate-scale-in" />
                      Saved!
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password" className="animate-fade-in">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="oldPassword">Current Password</Label>
                  <Input
                    id="oldPassword"
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="transition-all-smooth focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={loading}
                    minLength={8}
                    className="transition-all-smooth focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 8 characters
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="transition-all-smooth focus:ring-2 focus:ring-primary"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="transition-all-smooth hover:scale-105"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    'Change Password'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="animate-fade-in">
          <Card>
            <CardHeader>
              <CardTitle>Account Activity</CardTitle>
              <CardDescription>View your recent account activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-4 py-4 border-b transition-all-smooth hover:bg-muted/50 px-2 rounded">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Account Created</p>
                    <p className="text-sm text-muted-foreground">Your account was successfully created</p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Recently
                  </div>
                </div>

                <div className="flex items-start gap-4 py-4 border-b transition-all-smooth hover:bg-muted/50 px-2 rounded">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                    <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Last Login</p>
                    <p className="text-sm text-muted-foreground">You logged in to your account</p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Today
                  </div>
                </div>

                <div className="text-center py-8">
                  <Activity className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3 animate-float" />
                  <p className="text-muted-foreground text-sm">More activity details coming soon</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
