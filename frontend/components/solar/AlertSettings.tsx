'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Battery, Zap, Thermometer, Mail, Bell } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function AlertSettings() {
    const { toast } = useToast();

    // Alert toggles
    const [lowProductionEnabled, setLowProductionEnabled] = useState(true);
    const [lowBatteryEnabled, setLowBatteryEnabled] = useState(true);
    const [highTempEnabled, setHighTempEnabled] = useState(true);
    const [maintenanceEnabled, setMaintenanceEnabled] = useState(true);

    // Thresholds
    const [productionThreshold, setProductionThreshold] = useState([30]);
    const [batteryThreshold, setBatteryThreshold] = useState([20]);
    const [tempThreshold, setTempThreshold] = useState([75]);

    // Notification preferences
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [pushNotifications, setPushNotifications] = useState(false);

    const handleSave = () => {
        toast({
            title: 'Settings Saved',
            description: 'Alert settings have been updated successfully.',
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
                            checked={lowProductionEnabled}
                            onCheckedChange={setLowProductionEnabled}
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
                            checked={lowBatteryEnabled}
                            onCheckedChange={setLowBatteryEnabled}
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
                            checked={highTempEnabled}
                            onCheckedChange={setHighTempEnabled}
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
                            checked={maintenanceEnabled}
                            onCheckedChange={setMaintenanceEnabled}
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
                        <Label>Production Threshold ({productionThreshold[0]}% below expected)</Label>
                        <Slider
                            value={productionThreshold}
                            onValueChange={setProductionThreshold}
                            max={50}
                            step={5}
                            disabled={!lowProductionEnabled}
                            className="transition-all-smooth"
                        />
                        <p className="text-xs text-muted-foreground">
                            Alert when production is {productionThreshold[0]}% below expected levels
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Label>Battery Level Threshold ({batteryThreshold[0]}%)</Label>
                        <Slider
                            value={batteryThreshold}
                            onValueChange={setBatteryThreshold}
                            max={50}
                            step={5}
                            disabled={!lowBatteryEnabled}
                            className="transition-all-smooth"
                        />
                        <p className="text-xs text-muted-foreground">
                            Alert when battery level drops below {batteryThreshold[0]}%
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Label>Temperature Threshold ({tempThreshold[0]}°C)</Label>
                        <Slider
                            value={tempThreshold}
                            onValueChange={setTempThreshold}
                            min={60}
                            max={90}
                            step={5}
                            disabled={!highTempEnabled}
                            className="transition-all-smooth"
                        />
                        <p className="text-xs text-muted-foreground">
                            Alert when panel temperature exceeds {tempThreshold[0]}°C
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
                            checked={emailNotifications}
                            onCheckedChange={setEmailNotifications}
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
                            checked={pushNotifications}
                            onCheckedChange={setPushNotifications}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end animate-fade-in stagger-3">
                <Button onClick={handleSave} className="transition-all-smooth hover:scale-105">
                    Save Settings
                </Button>
            </div>
        </div>
    );
}
