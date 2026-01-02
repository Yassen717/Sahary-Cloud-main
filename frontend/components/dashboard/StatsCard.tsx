import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface StatsCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon: LucideIcon;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    iconColor?: string;
    delay?: number;
}

export function StatsCard({
    title,
    value,
    description,
    icon: Icon,
    trend,
    iconColor = 'text-muted-foreground',
    delay = 0,
}: StatsCardProps) {
    return (
        <Card
            className="hover-lift animate-fade-in opacity-0 overflow-hidden relative"
            style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
        >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <div className={`h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold transition-all-smooth">{value}</div>
                {description && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        {trend && (
                            <span
                                className={`inline-flex items-center text-xs font-medium ${trend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                    }`}
                            >
                                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
                            </span>
                        )}
                        {description}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
