'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface SolarChartProps {
    data?: Array<{
        time: string;
        production: number;
        consumption: number;
    }>;
}

const defaultData = [
    { time: '00:00', production: 0, consumption: 2.4 },
    { time: '04:00', production: 0, consumption: 1.8 },
    { time: '08:00', production: 3.2, consumption: 3.5 },
    { time: '12:00', production: 8.5, consumption: 4.2 },
    { time: '16:00', production: 6.8, consumption: 5.1 },
    { time: '20:00', production: 1.2, consumption: 3.8 },
    { time: '23:59', production: 0, consumption: 2.9 },
];

export function SolarChart({ data = defaultData }: SolarChartProps) {
    return (
        <Card className="animate-fade-in opacity-0 stagger-2">
            <CardHeader>
                <CardTitle>Solar Production & Consumption</CardTitle>
                <CardDescription>Energy metrics over the last 24 hours</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="productionGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.1} />
                                </linearGradient>
                                <linearGradient id="consumptionGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(142, 56%, 56%)" stopOpacity={0.6} />
                                    <stop offset="95%" stopColor="hsl(142, 56%, 56%)" stopOpacity={0.05} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="time"
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}kW`}
                            />
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="rounded-lg border bg-background p-3 shadow-md">
                                                <div className="grid gap-2">
                                                    <div className="flex items-center justify-between gap-4">
                                                        <span className="text-sm text-muted-foreground">Production</span>
                                                        <span className="text-sm font-bold text-primary">
                                                            {payload[0].value} kW
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-4">
                                                        <span className="text-sm text-muted-foreground">Consumption</span>
                                                        <span className="text-sm font-bold">
                                                            {payload[1].value} kW
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="production"
                                stroke="hsl(142, 76%, 36%)"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#productionGradient)"
                                animationDuration={1500}
                            />
                            <Area
                                type="monotone"
                                dataKey="consumption"
                                stroke="hsl(142, 56%, 56%)"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#consumptionGradient)"
                                animationDuration={1500}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
