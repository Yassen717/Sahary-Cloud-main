import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface SettingsSectionProps {
    icon: LucideIcon;
    title: string;
    description: string;
    children: ReactNode;
    delay?: number;
}

export function SettingsSection({
    icon: Icon,
    title,
    description,
    children,
    delay = 0,
}: SettingsSectionProps) {
    return (
        <Card
            className="animate-fade-in opacity-0 hover-lift"
            style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
        >
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription className="mt-1">{description}</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {children}
            </CardContent>
        </Card>
    );
}
