'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Bell,
    Check,
    Trash2,
    Server,
    DollarSign,
    Sun,
    AlertCircle,
    Settings,
    CheckCircle2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Notification {
    id: string;
    type: 'vm' | 'billing' | 'solar' | 'system';
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
}

const mockNotifications: Notification[] = [
    {
        id: '1',
        type: 'vm',
        title: 'VM Created Successfully',
        message: 'Your new VM "web-server-01" has been created and is now running.',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        read: false,
    },
    {
        id: '2',
        type: 'solar',
        title: 'Low Solar Production Alert',
        message: 'Current production is 30% below expected levels.',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        read: false,
    },
    {
        id: '3',
        type: 'billing',
        title: 'Payment Successful',
        message: 'Your payment of $49.99 has been processed successfully.',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        read: true,
    },
    {
        id: '4',
        type: 'system',
        title: 'System Maintenance Scheduled',
        message: 'Scheduled maintenance on January 20th from 2:00 AM to 4:00 AM.',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
        read: true,
    },
    {
        id: '5',
        type: 'vm',
        title: 'VM Stopped',
        message: 'VM "dev-environment" has been stopped.',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        read: true,
    },
];

export default function NotificationsPage() {
    const { toast } = useToast();
    const [notifications, setNotifications] = useState(mockNotifications);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleMarkAsRead = (id: string) => {
        setNotifications(notifs =>
            notifs.map(n => n.id === id ? { ...n, read: true } : n)
        );
    };

    const handleMarkAllAsRead = () => {
        setNotifications(notifs => notifs.map(n => ({ ...n, read: true })));
        toast({
            title: 'All Notifications Marked as Read',
            description: `Marked ${unreadCount} notifications as read.`,
        });
    };

    const handleDelete = (id: string) => {
        setNotifications(notifs => notifs.filter(n => n.id !== id));
        toast({
            title: 'Notification Deleted',
            description: 'The notification has been removed.',
        });
    };

    const handleClearAll = () => {
        setNotifications([]);
        toast({
            title: 'All Notifications Cleared',
            description: 'All notifications have been removed.',
        });
    };

    const filteredNotifications = filter === 'unread'
        ? notifications.filter(n => !n.read)
        : notifications;

    const getNotificationConfig = (type: Notification['type']) => {
        const configs = {
            vm: { icon: Server, color: 'text-primary', bg: 'bg-primary/10' },
            billing: { icon: DollarSign, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
            solar: { icon: Sun, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
            system: { icon: Settings, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
        };
        return configs[type];
    };

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="mb-6 animate-fade-in">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Notifications</h1>
                        <p className="text-muted-foreground">Stay updated with your system activity</p>
                    </div>
                    {unreadCount > 0 && (
                        <Badge variant="destructive" className="h-8 px-3 animate-pulse-slow">
                            {unreadCount} Unread
                        </Badge>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="hover-lift animate-fade-in">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Total</p>
                                <p className="text-2xl font-bold">{notifications.length}</p>
                            </div>
                            <Bell className="h-8 w-8 text-muted-foreground" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-1">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Unread</p>
                                <p className="text-2xl font-bold text-primary">{unreadCount}</p>
                            </div>
                            <AlertCircle className="h-8 w-8 text-primary" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-2">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">VM</p>
                                <p className="text-2xl font-bold">{notifications.filter(n => n.type === 'vm').length}</p>
                            </div>
                            <Server className="h-8 w-8 text-primary" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover-lift animate-fade-in stagger-3">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Solar</p>
                                <p className="text-2xl font-bold">{notifications.filter(n => n.type === 'solar').length}</p>
                            </div>
                            <Sun className="h-8 w-8 text-amber-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center justify-between mb-4 animate-fade-in stagger-4">
                <div className="flex gap-2">
                    <Button
                        variant={filter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilter('all')}
                    >
                        All ({notifications.length})
                    </Button>
                    <Button
                        variant={filter === 'unread' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilter('unread')}
                    >
                        Unread ({unreadCount})
                    </Button>
                </div>
                <div className="flex gap-2">
                    {unreadCount > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleMarkAllAsRead}
                        >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Mark All as Read
                        </Button>
                    )}
                    {notifications.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleClearAll}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Clear All
                        </Button>
                    )}
                </div>
            </div>

            {/* Notifications List */}
            <div className="space-y-2">
                {filteredNotifications.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4 animate-float" />
                            <p className="text-muted-foreground">
                                {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    filteredNotifications.map((notification, index) => {
                        const config = getNotificationConfig(notification.type);
                        const Icon = config.icon;

                        return (
                            <Card
                                key={notification.id}
                                className={`hover-lift transition-all-smooth animate-fade-in opacity-0 ${!notification.read ? 'border-l-4 border-l-primary bg-primary/5' : ''
                                    }`}
                                style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
                            >
                                <CardContent className="pt-6">
                                    <div className="flex items-start gap-4">
                                        <div className={`h-10 w-10 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                                            <Icon className={`h-5 w-5 ${config.color}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-4 mb-1">
                                                <h3 className="font-semibold">{notification.title}</h3>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {!notification.read && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleMarkAsRead(notification.id)}
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(notification.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-xs capitalize">{notification.type}</Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    {notification.timestamp.toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}
