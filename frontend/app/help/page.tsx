'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Search,
    Rocket,
    Server,
    Sun,
    CreditCard,
    Shield,
    BookOpen,
    MessageSquare,
    FileText,
    HelpCircle
} from 'lucide-react';
import Link from 'next/link';
import { FAQSection } from '@/components/help/FAQSection';
import { GettingStartedGuide } from '@/components/help/GettingStartedGuide';
import { faqCategories } from '@/lib/help-data';

export default function HelpPage() {
    const [searchQuery, setSearchQuery] = useState('');

    const iconMap = {
        Rocket: Rocket,
        Server: Server,
        Sun: Sun,
        CreditCard: CreditCard,
        Shield: Shield,
    };

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            {/* Header */}
            <div className="text-center mb-12 animate-fade-in">
                <HelpCircle className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h1 className="text-4xl font-bold mb-4">How can we help you?</h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                    Find answers to common questions, guides, and documentation
                </p>
            </div>

            {/* Main Content */}
            <Tabs defaultValue="faqs" className="space-y-8">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:w-auto">
                    <TabsTrigger value="faqs" className="gap-2">
                        <HelpCircle className="h-4 w-4" />
                        FAQs
                    </TabsTrigger>
                    <TabsTrigger value="guides" className="gap-2">
                        <BookOpen className="h-4 w-4" />
                        Getting Started
                    </TabsTrigger>
                    <TabsTrigger value="docs" className="gap-2">
                        <FileText className="h-4 w-4" />
                        Documentation
                    </TabsTrigger>
                    <TabsTrigger value="contact" className="gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Contact
                    </TabsTrigger>
                </TabsList>

                {/* FAQs Tab */}
                <TabsContent value="faqs" className="space-y-8 animate-fade-in">
                    {/* Category Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {faqCategories.map((category) => {
                            const Icon = iconMap[category.icon as keyof typeof iconMap];
                            return (
                                <Card
                                    key={category.id}
                                    className="hover-lift cursor-pointer group"
                                >
                                    <CardHeader>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                                <Icon className="h-5 w-5 text-primary" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">{category.title}</CardTitle>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <CardDescription>{category.description}</CardDescription>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {/* All FAQs */}
                    <div>
                        <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
                        <FAQSection />
                    </div>
                </TabsContent>

                {/* Getting Started Tab */}
                <TabsContent value="guides" className="animate-fade-in">
                    <GettingStartedGuide />
                </TabsContent>

                {/* Documentation Tab */}
                <TabsContent value="docs" className="space-y-6 animate-fade-in">
                    <div className="text-center max-w-2xl mx-auto mb-8">
                        <h2 className="text-3xl font-bold mb-4">Documentation</h2>
                        <p className="text-muted-foreground text-lg">
                            Comprehensive guides and API references for developers
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="hover-lift">
                            <CardHeader>
                                <div className="flex items-center gap-3 mb-2">
                                    <Server className="h-6 w-6 text-primary" />
                                    <CardTitle>VM Management</CardTitle>
                                </div>
                                <CardDescription>
                                    Learn how to create, manage, and optimize your virtual machines
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    <li>• Creating and configuring VMs</li>
                                    <li>• SSH access and security</li>
                                    <li>• Backup and restoration</li>
                                    <li>• Performance optimization</li>
                                </ul>
                                <Button className="w-full mt-4" variant="outline" asChild>
                                    <Link href="/help#vm-docs">Read VM Docs</Link>
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="hover-lift">
                            <CardHeader>
                                <div className="flex items-center gap-3 mb-2">
                                    <Sun className="h-6 w-6 text-primary" />
                                    <CardTitle>Solar Monitoring</CardTitle>
                                </div>
                                <CardDescription>
                                    Understanding your solar dashboard and metrics
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    <li>• Real-time production monitoring</li>
                                    <li>• Battery status and alerts</li>
                                    <li>• Environmental impact tracking</li>
                                    <li>• Solar credit system</li>
                                </ul>
                                <Button className="w-full mt-4" variant="outline" asChild>
                                    <Link href="/solar">View Solar Dashboard</Link>
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="hover-lift">
                            <CardHeader>
                                <div className="flex items-center gap-3 mb-2">
                                    <CreditCard className="h-6 w-6 text-primary" />
                                    <CardTitle>Billing & Pricing</CardTitle>
                                </div>
                                <CardDescription>
                                    Payment methods, invoices, and usage tracking
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    <li>• Hourly billing explained</li>
                                    <li>• Usage tracking and predictions</li>
                                    <li>• Payment methods</li>
                                    <li>• Invoice management</li>
                                </ul>
                                <Button className="w-full mt-4" variant="outline" asChild>
                                    <Link href="/billing">Go to Billing</Link>
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="hover-lift">
                            <CardHeader>
                                <div className="flex items-center gap-3 mb-2">
                                    <FileText className="h-6 w-6 text-primary" />
                                    <CardTitle>API Reference</CardTitle>
                                </div>
                                <CardDescription>
                                    REST API documentation for developers
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    <li>• Authentication</li>
                                    <li>• VM management endpoints</li>
                                    <li>• Solar data API</li>
                                    <li>• Billing API</li>
                                </ul>
                                <Button className="w-full mt-4" variant="outline" asChild>
                                    <Link href="/help#api-docs">View API Docs</Link>
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Contact Tab */}
                <TabsContent value="contact" className="space-y-6 animate-fade-in">
                    <div className="text-center max-w-2xl mx-auto mb-8">
                        <h2 className="text-3xl font-bold mb-4">Contact Support</h2>
                        <p className="text-muted-foreground text-lg">
                            Our team is here to help 24/7
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card>
                            <CardHeader>
                                <MessageSquare className="h-8 w-8 text-primary mb-2" />
                                <CardTitle>Live Chat</CardTitle>
                                <CardDescription>
                                    Chat with our support team in real-time
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full">Start Chat</Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <FileText className="h-8 w-8 text-primary mb-2" />
                                <CardTitle>Support Ticket</CardTitle>
                                <CardDescription>
                                    Submit a ticket for technical issues
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full" variant="outline">Create Ticket</Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <MessageSquare className="h-8 w-8 text-primary mb-2" />
                                <CardTitle>Email Support</CardTitle>
                                <CardDescription>
                                    Reach us at support@saharycloud.com
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full" variant="outline" asChild>
                                    <a href="mailto:support@saharycloud.com">Send Email</a>
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="bg-primary/5">
                        <CardHeader>
                            <CardTitle>Community & Resources</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-muted-foreground">
                                Join our community to connect with other Sahary Cloud users and stay updated.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                                    Discord Community
                                </Badge>
                                <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                                    Twitter Updates
                                </Badge>
                                <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                                    Blog & Tutorials
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
