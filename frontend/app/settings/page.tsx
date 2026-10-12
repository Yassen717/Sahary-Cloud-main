'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Palette,
    Bell,
    Shield,
    CreditCard,
    Globe,
    AlertTriangle,
    Smartphone,
    Mail as MailIcon
} from 'lucide-react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useTheme } from 'next-themes';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api';

type NotificationPrefs = { email: boolean; sms: boolean; marketing: boolean };
type Session = { sessionId: string; ipAddress: string | null; userAgent: string | null; createdAt: string; current: boolean };

const PREFS_KEY = 'sahary-notification-prefs';
const DEFAULT_PREFS: NotificationPrefs = { email: true, sms: false, marketing: true };

const readStoredPrefs = (): NotificationPrefs => {
    try {
        return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
    } catch {
        return DEFAULT_PREFS;
    }
};

const ComingSoon = () => <Badge variant="secondary">Coming soon</Badge>;

export default function SettingsPage() {
    const { theme, setTheme } = useTheme();
    const { toast } = useToast();
    const { logout } = useAuth();
    const [mounted, setMounted] = useState(false);

    // Notification preferences (stored on this device only)
    const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

    // Sessions
    const [sessions, setSessions] = useState<Session[] | null>(null);
    const [sessionsLoading, setSessionsLoading] = useState(false);

    // Deactivate account
    const [deactivateOpen, setDeactivateOpen] = useState(false);
    const [deactivatePassword, setDeactivatePassword] = useState('');
    const [deactivating, setDeactivating] = useState(false);

    useEffect(() => {
        setPrefs(readStoredPrefs());
        setMounted(true);
    }, []);

    const handleSaveSettings = () => {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        toast({
            title: 'Settings Saved',
            description: 'Preferences saved on this device.',
        });
    };

    const loadSessions = async () => {
        setSessionsLoading(true);
        try {
            const res = await apiClient.getSessions();
            setSessions(res?.data?.sessions ?? []);
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'Failed to load sessions', variant: 'destructive' });
        } finally {
            setSessionsLoading(false);
        }
    };

    const handleToggleSessions = () => {
        if (sessions) {
            setSessions(null);
        } else {
            loadSessions();
        }
    };

    const handleRevokeSession = async (sessionId: string) => {
        try {
            await apiClient.revokeSession(sessionId);
            setSessions((prev) => prev?.filter((session) => session.sessionId !== sessionId) ?? null);
            toast({ title: 'Session revoked', description: 'That device has been signed out.' });
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'Failed to revoke session', variant: 'destructive' });
        }
    };

    const handleSignOutAll = async () => {
        try {
            await apiClient.revokeAllSessions();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'Failed to sign out sessions', variant: 'destructive' });
            return;
        }
        toast({ title: 'Signed out', description: 'All sessions have been revoked.' });
        await logout();
    };

    const handleDeactivate = async (e: React.MouseEvent) => {
        e.preventDefault();
        setDeactivating(true);
        try {
            await apiClient.deactivateAccount(deactivatePassword);
            setDeactivateOpen(false);
            toast({
                title: 'Account deactivated',
                description: 'Check your email for the link to reactivate within 72 hours.',
            });
            await logout();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'Failed to deactivate account', variant: 'destructive' });
        } finally {
            setDeactivating(false);
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="mb-8 animate-fade-in">
                <h1 className="text-3xl font-bold">Settings</h1>
                <p className="text-muted-foreground mt-1">Manage your application preferences and account settings</p>
            </div>

            <div className="space-y-6">
                {/* Appearance Settings */}
                <SettingsSection
                    icon={Palette}
                    title="Appearance"
                    description="Customize how the application looks"
                    delay={0}
                >
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Theme</Label>
                            <p className="text-sm text-muted-foreground">Choose light or dark mode</p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant={mounted && theme === 'light' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setTheme('light')}
                                className="transition-all-smooth"
                            >
                                Light
                            </Button>
                            <Button
                                variant={mounted && theme === 'dark' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setTheme('dark')}
                                className="transition-all-smooth"
                            >
                                Dark
                            </Button>
                        </div>
                    </div>
                </SettingsSection>

                {/* Notification Settings */}
                <SettingsSection
                    icon={Bell}
                    title="Notifications"
                    description="Manage how you receive notifications. Preferences are saved on this device."
                    delay={100}
                >
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                    <MailIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="space-y-0.5">
                                    <Label htmlFor="email-notifications">Email Notifications</Label>
                                    <p className="text-sm text-muted-foreground">Receive updates via email</p>
                                </div>
                            </div>
                            <Switch
                                id="email-notifications"
                                checked={prefs.email}
                                onCheckedChange={(email) => setPrefs((p) => ({ ...p, email }))}
                                className="transition-all-smooth"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <Smartphone className="h-4 w-4 text-green-600 dark:text-green-400" />
                                </div>
                                <div className="space-y-0.5">
                                    <Label htmlFor="sms-notifications">SMS Notifications</Label>
                                    <p className="text-sm text-muted-foreground">Get alerts via text message</p>
                                </div>
                            </div>
                            <Switch
                                id="sms-notifications"
                                checked={prefs.sms}
                                onCheckedChange={(sms) => setPrefs((p) => ({ ...p, sms }))}
                                className="transition-all-smooth"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                    <Bell className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div className="space-y-0.5">
                                    <Label htmlFor="marketing-emails">Marketing Emails</Label>
                                    <p className="text-sm text-muted-foreground">Receive product updates and offers</p>
                                </div>
                            </div>
                            <Switch
                                id="marketing-emails"
                                checked={prefs.marketing}
                                onCheckedChange={(marketing) => setPrefs((p) => ({ ...p, marketing }))}
                                className="transition-all-smooth"
                            />
                        </div>
                    </div>
                </SettingsSection>

                {/* Security Settings */}
                <SettingsSection
                    id="security"
                    icon={Shield}
                    title="Security"
                    description="Manage your account security"
                    delay={200}
                >
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="two-factor">Two-Factor Authentication</Label>
                                    <ComingSoon />
                                </div>
                                <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                            </div>
                            <Switch id="two-factor" disabled />
                        </div>

                        <div className="pt-4 border-t space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <div className="space-y-0.5">
                                    <Label>Active Sessions</Label>
                                    <p className="text-sm text-muted-foreground">Devices currently signed in to your account</p>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={handleToggleSessions}
                                    disabled={sessionsLoading}
                                    className="transition-all-smooth"
                                >
                                    {sessions ? 'Hide Active Sessions' : sessionsLoading ? 'Loading...' : 'View Active Sessions'}
                                </Button>
                            </div>

                            {sessions && (
                                <div className="space-y-3">
                                    {sessions.length === 0 && (
                                        <p className="text-sm text-muted-foreground">No active sessions found.</p>
                                    )}
                                    {sessions.map((session) => (
                                        <div key={session.sessionId} className="flex items-center justify-between gap-4 p-3 rounded-lg border">
                                            <div className="min-w-0 space-y-0.5">
                                                <p className="text-sm font-medium truncate">{session.userAgent || 'Unknown device'}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {session.ipAddress || 'Unknown IP'} · Signed in {new Date(session.createdAt).toLocaleString()}
                                                </p>
                                            </div>
                                            {session.current ? (
                                                <Badge variant="outline">This device</Badge>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleRevokeSession(session.sessionId)}
                                                    className="transition-all-smooth"
                                                >
                                                    Revoke
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between gap-4">
                                        <p className="text-xs text-muted-foreground">Signing out all sessions also signs you out on this device.</p>
                                        <Button variant="destructive" size="sm" onClick={handleSignOutAll} className="transition-all-smooth">
                                            Sign out all sessions
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </SettingsSection>

                {/* Billing Settings */}
                <SettingsSection
                    icon={CreditCard}
                    title="Billing & Payments"
                    description="Manage your payment methods and billing"
                    delay={300}
                >
                    <div className="space-y-4">
                        <div className="p-4 rounded-lg border bg-muted/50">
                            <p className="text-sm text-muted-foreground">No payment methods added yet</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" disabled>
                                Add Payment Method
                            </Button>
                            <ComingSoon />
                        </div>
                    </div>
                </SettingsSection>

                {/* Preferences */}
                <SettingsSection
                    icon={Globe}
                    title="Preferences"
                    description="Customize your experience"
                    delay={400}
                >
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Language</Label>
                                <p className="text-sm text-muted-foreground">Choose your preferred language</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">English</span>
                                <ComingSoon />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Timezone</Label>
                                <p className="text-sm text-muted-foreground">Your local timezone</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">UTC+0</span>
                                <ComingSoon />
                            </div>
                        </div>
                    </div>
                </SettingsSection>

                {/* Danger Zone */}
                <SettingsSection
                    icon={AlertTriangle}
                    title="Danger Zone"
                    description="Irreversible and destructive actions"
                    delay={500}
                >
                    <div className="space-y-4 p-4 rounded-lg border-2 border-destructive/50 bg-destructive/5">
                        <div className="space-y-2">
                            <h4 className="font-semibold text-destructive">Deactivate Account</h4>
                            <p className="text-sm text-muted-foreground">
                                Deactivate your account and sign out. You can reactivate it within 72 hours using the link we email you.
                            </p>
                        </div>
                        <AlertDialog
                            open={deactivateOpen}
                            onOpenChange={(open) => {
                                setDeactivateOpen(open);
                                if (!open) setDeactivatePassword('');
                            }}
                        >
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="transition-all-smooth hover:scale-105">
                                    Deactivate Account
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="animate-scale-in">
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Deactivate your account?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        You will be signed out and your account will be deactivated. Enter your password to confirm.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="space-y-2">
                                    <Label htmlFor="deactivate-password">Password</Label>
                                    <Input
                                        id="deactivate-password"
                                        type="password"
                                        value={deactivatePassword}
                                        onChange={(e) => setDeactivatePassword(e.target.value)}
                                        disabled={deactivating}
                                    />
                                </div>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="transition-all-smooth" disabled={deactivating}>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleDeactivate}
                                        disabled={!deactivatePassword || deactivating}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all-smooth"
                                    >
                                        {deactivating ? 'Deactivating...' : 'Deactivate account'}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </SettingsSection>

                {/* Save Button */}
                <div className="flex justify-end animate-fade-in opacity-0 stagger-4">
                    <Button
                        onClick={handleSaveSettings}
                        className="transition-all-smooth hover:scale-105"
                    >
                        Save All Settings
                    </Button>
                </div>
            </div>
        </div>
    );
}
