'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Battery, Zap, Thermometer, Mail, Bell } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STORAGE_KEY = 'solarAlertSettings';

interface AlertSettingsValues {
    lowProductionEnabled: boolean;
    lowBatteryEnabled: boolean;
    highTempEnabled: boolean;
    maintenanceEnabled: boolean;
    productionThreshold: number;
    batteryThreshold: number;
    tempThreshold: number;
    emailNotifications: boolean;
    pushNotifications: boolean;
}

const defaultSettings: AlertSettingsValues = {
    lowProductionEnabled: true,
    lowBatteryEnabled: true,
    highTempEnabled: true,
    maintenanceEnabled: true,
    productionThreshold: 30,
    batteryThreshold: 20,
    tempThreshold: 75,
    emailNotifications: true,
    pushNotifications: false,
};

export function AlertSettings() {
    const { toast } = useToast();
    const [settings, setSettings] = useState<AlertSettingsValues>(defaultSettings);

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            if (stored) setSettings({ ...defaultSettings, ...JSON.parse(stored) });
        } catch (_) { }
    }, []);

    const update = <K extends keyof AlertSettingsValues>(key: K, value: AlertSettingsValues[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        toast({
            title: 'Settings saved in this browser',
            description: 'These preferences are stored locally and are not sent to the server.',
        });
    };

    return (
        <div className="space-y-6">
            {/* Alert Types */}
            <Card className="animate-fade-in">
                <CardHeader>
                    <CardTitle>Alert Types</CardTitle>
                    <CardDescription>Enable or disable specific alert types</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div className="space-y-0.5">
                                <Label htmlFor="low-production">Low Solar Production</Label>
                                <p className="text-sm text-muted-foreground">Alert when production falls below threshold</p>
                            </div>
                        </div>
                        <Switch
                            id="low-production"
                            checked={settings.lowProductionEnabled}
                            onCheckedChange={(value) => update('lowProductionEnabled', value)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                <Battery className="h-4 w-4 text-red-600 dark:text-red-400" />
                            </div>
                            <div className="space-y-0.5">
                                <Label htmlFor="low-battery">Low Battery Level</Label>
                                <p className="text-sm text-muted-foreground">Alert when battery level is critically low</p>
                            </div>
                        </div>
                        <Switch
                            id="low-battery"
                            checked={settings.lowBatteryEnabled}
                            onCheckedChange={(value) => update('lowBatteryEnabled', value)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                                <Thermometer className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div className="space-y-0.5">
                                <Label htmlFor="high-temp">High Temperature</Label>
                                <p className="text-sm text-muted-foreground">Alert when panels overheat</p>
                            </div>
                        </div>
                        <Switch
                            id="high-temp"
                            checked={settings.highTempEnabled}
                            onCheckedChange={(value) => update('highTempEnabled', value)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="space-y-0.5">
                                <Label htmlFor="maintenance">Maintenance Reminders</Label>
                                <p className="text-sm text-muted-foreground">Schedule maintenance notifications</p>
                            </div>
                        </div>
                        <Switch
                            id="maintenance"
                            checked={settings.maintenanceEnabled}
                            onCheckedChange={(value) => update('maintenanceEnabled', value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Thresholds */}
            <Card className="animate-fade-in stagger-1">
                <CardHeader>
                    <CardTitle>Alert Thresholds</CardTitle>
                    <CardDescription>Configure when alerts should be triggered</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-3">
                        <Label>Production Threshold ({settings.productionThreshold}% below expected)</Label>
                        <Slider
                            value={[settings.productionThreshold]}
                            onValueChange={([value]) => update('productionThreshold', value)}
                            max={50}
                            step={5}
                            disabled={!settings.lowProductionEnabled}
                            className="transition-all-smooth"
                        />
                        <p className="text-xs text-muted-foreground">
                            Alert when production is {settings.productionThreshold}% below expected levels
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Label>Battery Level Threshold ({settings.batteryThreshold}%)</Label>
                        <Slider
                            value={[settings.batteryThreshold]}
                            onValueChange={([value]) => update('batteryThreshold', value)}
                            max={50}
                            step={5}
                            disabled={!settings.lowBatteryEnabled}
                            className="transition-all-smooth"
                        />
                        <p className="text-xs text-muted-foreground">
                            Alert when battery level drops below {settings.batteryThreshold}%
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Label>Temperature Threshold ({settings.tempThreshold}°C)</Label>
                        <Slider
                            value={[settings.tempThreshold]}
                            onValueChange={([value]) => update('tempThreshold', value)}
                            min={60}
                            max={90}
                            step={5}
                            disabled={!settings.highTempEnabled}
                            className="transition-all-smooth"
                        />
                        <p className="text-xs text-muted-foreground">
                            Alert when panel temperature exceeds {settings.tempThreshold}°C
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Notification Preferences */}
            <Card className="animate-fade-in stagger-2">
                <CardHeader>
                    <CardTitle>Notification Preferences</CardTitle>
                    <CardDescription>Choose how you want to receive alerts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                <Mail className="h-4 w-4 text-green-600 dark:text-green-400" />
                            </div>
                            <div className="space-y-0.5">
                                <Label htmlFor="email-notif">Email Notifications</Label>
                                <p className="text-sm text-muted-foreground">Receive alerts via email</p>
                            </div>
                        </div>
                        <Switch
                            id="email-notif"
                            checked={settings.emailNotifications}
                            onCheckedChange={(value) => update('emailNotifications', value)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                <Bell className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div className="space-y-0.5">
                                <Label htmlFor="push-notif">Push Notifications</Label>
                                <p className="text-sm text-muted-foreground">Browser push notifications</p>
                            </div>
                        </div>
                        <Switch
                            id="push-notif"
                            checked={settings.pushNotifications}
                            onCheckedChange={(value) => update('pushNotifications', value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex items-center justify-end gap-4 animate-fade-in stagger-3">
                <p className="text-sm text-muted-foreground">
                    Settings are stored in this browser only and are not sent to the server.
                </p>
                <Button onClick={handleSave} className="transition-all-smooth hover:scale-105">
                    Save Settings
                </Button>
            </div>
        </div>
    );
}
