'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Bell } from 'lucide-react';

export default function NotificationsPage() {
    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="mb-6 animate-fade-in">
                <h1 className="text-3xl font-bold mb-2">Notifications</h1>
                <p className="text-muted-foreground">Stay updated with your system activity</p>
            </div>

            <Card className="animate-fade-in">
                <CardContent className="py-16 text-center">
                    <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">You have no notifications</p>
                </CardContent>
            </Card>
        </div>
    );
}
