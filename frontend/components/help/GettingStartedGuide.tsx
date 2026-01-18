import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Rocket,
    Server,
    CreditCard,
    Shield,
    CheckCircle2,
    ArrowRight
} from 'lucide-react';
import Link from 'next/link';

const steps = [
    {
        number: 1,
        title: 'Create Your Account',
        description: 'Sign up with your email and create a secure password. No credit card required to start.',
        icon: Shield,
        action: 'Sign Up',
        href: '/register',
    },
    {
        number: 2,
        title: 'Set Up Your First VM',
        description: 'Choose your VM specifications, select an operating system, and launch in minutes.',
        icon: Server,
        action: 'Create VM',
        href: '/vms/create',
    },
    {
        number: 3,
        title: 'Monitor Solar Production',
        description: 'Track real-time energy production and see your environmental impact on the Solar Dashboard.',
        icon: Rocket,
        action: 'View Solar Dashboard',
        href: '/solar',
    },
    {
        number: 4,
        title: 'Manage Billing',
        description: 'View usage, invoices, and set up payment methods in the Billing section.',
        icon: CreditCard,
        action: 'Go to Billing',
        href: '/billing',
    },
];

export function GettingStartedGuide() {
    return (
        <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto">
                <h2 className="text-3xl font-bold mb-4">Get Started in 4 Easy Steps</h2>
                <p className="text-muted-foreground text-lg">
                    Follow this guide to quickly set up your solar-powered cloud infrastructure
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {steps.map((step) => {
                    const Icon = step.icon;
                    return (
                        <Card key={step.number} className="relative overflow-hidden hover-lift">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-16 translate-x-16" />

                            <CardHeader>
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                            <Icon className="h-6 w-6 text-primary" />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-sm font-medium text-primary">Step {step.number}</span>
                                        </div>
                                        <CardTitle className="text-xl">{step.title}</CardTitle>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <CardDescription className="text-base leading-relaxed">
                                    {step.description}
                                </CardDescription>

                                <Button asChild className="w-full">
                                    <Link href={step.href} className="flex items-center justify-center gap-2">
                                        {step.action}
                                        <ArrowRight className="h-4 w-4" />
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Card className="bg-primary/5 border-primary/20">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-6 w-6 text-primary" />
                        <CardTitle>Need Help?</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-muted-foreground">
                        Our support team is available 24/7 to help you get started. Don't hesitate to reach out!
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Button asChild variant="outline">
                            <Link href="/help#faqs">View FAQs</Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link href="#contact">Contact Support</Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
