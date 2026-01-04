'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
    Sun,
    Battery,
    Thermometer,
    Gauge,
    Settings,
    Wrench,
    FileText,
    Zap,
    RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SolarManagementPage() {
    const { toast } = useToast();

    // Sensor configuration
    const [productionSensor, setProductionSensor] = useState([5.0]);
    const [batterySensor, setBatterySensor] = useState([12.0]);
    const [tempSensor, setTempSensor] = useState([25.0]);
    const [irradianceSensor, setIrradianceSensor] = useState([800]);

    // Solar panel configuration
    const [panelCount, setPanelCount] = useState('24');
    const [panelCapacity, setPanelCapacity] = useState('400');
    const [batteryCapacity, setBatteryCapacity] = useState('100');
    const [inverterEfficiency, setInverterEfficiency] = useState('95');

    // Maintenance schedule
    const [lastMaintenance, setLastMaintenance] = useState('2026-01-01');
    const [nextMaintenance, setNextMaintenance] = useState('2026-04-01');

    const handleCalibrateSensors = () => {
        toast({
            title: 'Sensors Calibrated',
            description: 'All sensors have been recalibrated successfully.',
        });
    };

    const handleSaveConfig = () => {
        toast({
            title: 'Configuration Saved',
            description: 'Solar system configuration has been updated.',
        });
    };

    const handleScheduleMaintenance = () => {
        toast({
            title: 'Maintenance Scheduled',
            description: `Next maintenance scheduled for ${nextMaintenance}`,
        });
    };

    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">Solar System Management</h1>
                <p className="text-muted-foreground">Configure and maintain the solar energy system</p>
            </div>

            {/* System Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card className="hover-lift animate-fade-in">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Total Capacity</CardTitle>
                            <Sun className="h-4 w-4 text-amber-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{(Number(panelCount) * Number(panelCapacity) / 1000).toFixed(1)} kW</div>
                        <p className="text-xs text-muted-foreground mt-1">{panelCount} panels × {panelCapacity}W</p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-1">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Battery</CardTitle>
                            <Battery className="h-4 w-4 text-green-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{batteryCapacity} kWh</div>
                        <p className="text-xs text-muted-foreground mt-1">Storage capacity</p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-2">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Efficiency</CardTitle>
                            <Gauge className="h-4 w-4 text-blue-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{inverterEfficiency}%</div>
                        <p className="text-xs text-muted-foreground mt-1">Inverter efficiency</p>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-3">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">Next Service</CardTitle>
                            <Wrench className="h-4 w-4 text-purple-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                            {Math.ceil((new Date(nextMaintenance).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}d
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{nextMaintenance}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="sensors" className="space-y-4 animate-fade-in stagger-4">
                <TabsList>
                    <TabsTrigger value="sensors">
                        <Settings className="h-4 w-4 mr-2" />
                        Sensor Calibration
                    </TabsTrigger>
                    <TabsTrigger value="config">
                        <Sun className="h-4 w-4 mr-2" />
                        System Config
                    </TabsTrigger>
                    <TabsTrigger value="maintenance">
                        <Wrench className="h-4 w-4 mr-2" />
                        Maintenance
                    </TabsTrigger>
                    <TabsTrigger value="reports">
                        <FileText className="h-4 w-4 mr-2" />
                        Reports
                    </TabsTrigger>
                </TabsList>

                {/* Sensor Calibration Tab */}
                <TabsContent value="sensors" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Sensor Calibration</CardTitle>
                            <CardDescription>Adjust sensor readings and calibration offsets</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Zap className="h-4 w-4 text-amber-500" />
                                        <Label>Production Sensor (Offset: ±{productionSensor[0]} kW)</Label>
                                    </div>
                                    <Badge variant="outline">Active</Badge>
                                </div>
                                <Slider
                                    value={productionSensor}
                                    onValueChange={setProductionSensor}
                                    min={0}
                                    max={10}
                                    step={0.1}
                                    className="transition-all-smooth"
                                />
                                <p className="text-xs text-muted-foreground">Adjust calibration offset for production readings</p>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Battery className="h-4 w-4 text-green-500" />
                                        <Label>Battery Level Sensor (Offset: ±{batterySensor[0]} V)</Label>
                                    </div>
                                    <Badge variant="outline">Active</Badge>
                                </div>
                                <Slider
                                    value={batterySensor}
                                    onValueChange={setBatterySensor}
                                    min={0}
                                    max={24}
                                    step={0.1}
                                    className="transition-all-smooth"
                                />
                                <p className="text-xs text-muted-foreground">Adjust battery voltage sensor calibration</p>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Thermometer className="h-4 w-4 text-red-500" />
                                        <Label>Temperature Sensor (Offset: ±{tempSensor[0]} °C)</Label>
                                    </div>
                                    <Badge variant="outline">Active</Badge>
                                </div>
                                <Slider
                                    value={tempSensor}
                                    onValueChange={setTempSensor}
                                    min={0}
                                    max={50}
                                    step={0.5}
                                    className="transition-all-smooth"
                                />
                                <p className="text-xs text-muted-foreground">Temperature offset calibration</p>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Sun className="h-4 w-4 text-yellow-500" />
                                        <Label>Solar Irradiance (Offset: ±{irradianceSensor[0]} W/m²)</Label>
                                    </div>
                                    <Badge variant="outline">Active</Badge>
                                </div>
                                <Slider
                                    value={irradianceSensor}
                                    onValueChange={setIrradianceSensor}
                                    min={0}
                                    max={1200}
                                    step={10}
                                    className="transition-all-smooth"
                                />
                                <p className="text-xs text-muted-foreground">Solar radiation sensor calibration</p>
                            </div>

                            <Button onClick={handleCalibrateSensors} className="w-full transition-all-smooth hover:scale-105">
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Calibrate All Sensors
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* System Configuration Tab */}
                <TabsContent value="config" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Solar Panel Configuration</CardTitle>
                                <CardDescription>Panel specifications and setup</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="panel-count">Number of Panels</Label>
                                    <Input
                                        id="panel-count"
                                        type="number"
                                        value={panelCount}
                                        onChange={(e) => setPanelCount(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="panel-capacity">Panel Capacity (W)</Label>
                                    <Input
                                        id="panel-capacity"
                                        type="number"
                                        value={panelCapacity}
                                        onChange={(e) => setPanelCapacity(e.target.value)}
                                    />
                                </div>
                                <div className="p-3 bg-primary/10 rounded-lg">
                                    <p className="text-sm font-medium">Total System Capacity</p>
                                    <p className="text-2xl font-bold text-primary">
                                        {(Number(panelCount) * Number(panelCapacity) / 1000).toFixed(2)} kW
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Battery & Inverter</CardTitle>
                                <CardDescription>Energy storage configuration</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="battery-capacity">Battery Capacity (kWh)</Label>
                                    <Input
                                        id="battery-capacity"
                                        type="number"
                                        value={batteryCapacity}
                                        onChange={(e) => setBatteryCapacity(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="inverter-efficiency">Inverter Efficiency (%)</Label>
                                    <Input
                                        id="inverter-efficiency"
                                        type="number"
                                        value={inverterEfficiency}
                                        onChange={(e) => setInverterEfficiency(e.target.value)}
                                    />
                                </div>
                                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                    <p className="text-sm font-medium">System Efficiency</p>
                                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                        {inverterEfficiency}%
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={handleSaveConfig} className="transition-all-smooth hover:scale-105">
                            Save Configuration
                        </Button>
                    </div>
                </TabsContent>

                {/* Maintenance Tab */}
                <TabsContent value="maintenance" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Maintenance Schedule</CardTitle>
                            <CardDescription>Track and plan system maintenance</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="last-maintenance">Last Maintenance</Label>
                                    <Input
                                        id="last-maintenance"
                                        type="date"
                                        value={lastMaintenance}
                                        onChange={(e) => setLastMaintenance(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="next-maintenance">Next Maintenance</Label>
                                    <Input
                                        id="next-maintenance"
                                        type="date"
                                        value={nextMaintenance}
                                        onChange={(e) => setNextMaintenance(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="p-4 border rounded-lg space-y-3">
                                <h4 className="font-semibold">Maintenance Checklist</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="h-4 w-4 rounded-full bg-green-500" />
                                        <span>Solar panel cleaning - Completed</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="h-4 w-4 rounded-full bg-green-500" />
                                        <span>Connection inspection - Completed</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="h-4 w-4 rounded-full bg-amber-500 animate-pulse-slow" />
                                        <span>Battery health check - Pending</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="h-4 w-4 rounded-full bg-muted" />
                                        <span>Inverter firmware update - Scheduled</span>
                                    </div>
                                </div>
                            </div>

                            <Button onClick={handleScheduleMaintenance} className="w-full transition-all-smooth hover:scale-105">
                                <Wrench className="h-4 w-4 mr-2" />
                                Schedule Maintenance
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Reports Tab */}
                <TabsContent value="reports" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>System Reports</CardTitle>
                            <CardDescription>Performance and maintenance reports</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-all-smooth">
                                <div className="flex items-center gap-3">
                                    <FileText className="h-5 w-5 text-primary" />
                                    <div>
                                        <p className="font-medium">Monthly Production Report</p>
                                        <p className="text-sm text-muted-foreground">December 2025</p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm">Download</Button>
                            </div>
                            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-all-smooth">
                                <div className="flex items-center gap-3">
                                    <FileText className="h-5 w-5 text-primary" />
                                    <div>
                                        <p className="font-medium">System Efficiency Analysis</p>
                                        <p className="text-sm text-muted-foreground">Q4 2025</p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm">Download</Button>
                            </div>
                            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-all-smooth">
                                <div className="flex items-center gap-3">
                                    <FileText className="h-5 w-5 text-primary" />
                                    <div>
                                        <p className="font-medium">Maintenance History</p>
                                        <p className="text-sm text-muted-foreground">All time</p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm">Download</Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
