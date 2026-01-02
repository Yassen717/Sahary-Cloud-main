'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
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

export default function SettingsPage() {
    const { theme, setTheme } = useTheme();
    const { toast } = useToast();

    // Notification preferences
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [smsNotifications, setSmsNotifications] = useState(false);
    const [marketingEmails, setMarketingEmails] = useState(true);

    // Security settings
    const [twoFactorAuth, setTwoFactorAuth] = useState(false);

    const handleSaveSettings = () => {
        toast({
            title: 'Settings Saved',
            description: 'Your preferences have been updated successfully.',
        });
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
                                variant={theme === 'light' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setTheme('light')}
                                className="transition-all-smooth"
                            >
                                Light
                            </Button>
                            <Button
                                variant={theme === 'dark' ? 'default' : 'outline'}
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
                    description="Manage how you receive notifications"
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
                                checked={emailNotifications}
                                onCheckedChange={setEmailNotifications}
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
                                checked={smsNotifications}
                                onCheckedChange={setSmsNotifications}
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
                                checked={marketingEmails}
                                onCheckedChange={setMarketingEmails}
                                className="transition-all-smooth"
                            />
                        </div>
                    </div>
                </SettingsSection>

                {/* Security Settings */}
                <SettingsSection
                    icon={Shield}
                    title="Security"
                    description="Manage your account security"
                    delay={200}
                >
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="two-factor">Two-Factor Authentication</Label>
                                <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                            </div>
                            <Switch
                                id="two-factor"
                                checked={twoFactorAuth}
                                onCheckedChange={setTwoFactorAuth}
                                className="transition-all-smooth"
                            />
                        </div>

                        <div className="pt-4 border-t">
                            <Button variant="outline" className="transition-all-smooth hover:scale-105">
                                View Active Sessions
                            </Button>
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
                        <Button variant="outline" className="transition-all-smooth hover:scale-105">
                            Add Payment Method
                        </Button>
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
                            <Button variant="outline" size="sm" className="transition-all-smooth">
                                English
                            </Button>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Timezone</Label>
                                <p className="text-sm text-muted-foreground">Your local timezone</p>
                            </div>
                            <Button variant="outline" size="sm" className="transition-all-smooth">
                                UTC+0
                            </Button>
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
                            <h4 className="font-semibold text-destructive">Delete Account</h4>
                            <p className="text-sm text-muted-foreground">
                                Permanently delete your account and all associated data. This action cannot be undone.
                            </p>
                        </div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="transition-all-smooth hover:scale-105">
                                    Delete Account
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="animate-scale-in">
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete your account
                                        and remove all your data from our servers.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="transition-all-smooth">Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all-smooth"
                                    >
                                        Yes, delete my account
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
