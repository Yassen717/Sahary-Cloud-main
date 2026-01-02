import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Alert {
    id: string;
    title: string;
    message: string;
    severity: 'critical' | 'warning' | 'info';
    type: string;
    timestamp: Date;
    resolved: boolean;
    resolvedAt?: Date;
}

interface AlertCardProps {
    alert: Alert;
    onResolve?: (id: string) => void;
    delay?: number;
}

const severityConfig = {
    critical: {
        icon: AlertCircle,
        color: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-100 dark:bg-red-900/30',
        border: 'border-red-500',
        badge: 'destructive',
    },
    warning: {
        icon: AlertTriangle,
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        border: 'border-amber-500',
        badge: 'outline',
    },
    info: {
        icon: Info,
        color: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        border: 'border-blue-500',
        badge: 'outline',
    },
};

export function AlertCard({ alert, onResolve, delay = 0 }: AlertCardProps) {
    const config = severityConfig[alert.severity];
    const Icon = config.icon;

    return (
        <Card
            className={`animate-fade-in opacity-0 hover-lift ${alert.resolved ? 'opacity-75' : ''
                } ${alert.severity === 'critical' && !alert.resolved ? 'border-2 ' + config.border : ''}`}
            style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
        >
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                        <div className={`h-10 w-10 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`h-5 w-5 ${config.icon}`} />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <CardTitle className="text-lg">{alert.title}</CardTitle>
                                {alert.resolved ? (
                                    <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Resolved
                                    </Badge>
                                ) : (
                                    <Badge variant={config.badge as any} className={alert.severity === 'critical' ? 'animate-pulse-slow' : ''}>
                                        {alert.severity.toUpperCase()}
                                    </Badge>
                                )}
                            </div>
                            <CardDescription className="text-sm">{alert.message}</CardDescription>
                            <p className="text-xs text-muted-foreground mt-2">
                                {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                                {alert.resolved && alert.resolvedAt && (
                                    <span> • Resolved {formatDistanceToNow(alert.resolvedAt, { addSuffix: true })}</span>
                                )}
                            </p>
                        </div>
                    </div>
                    {!alert.resolved && onResolve && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onResolve(alert.id)}
                            className="hover:bg-green-100 dark:hover:bg-green-900/30 transition-all-smooth"
                        >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Resolve
                        </Button>
                    )}
                </div>
            </CardHeader>
        </Card>
    );
}
