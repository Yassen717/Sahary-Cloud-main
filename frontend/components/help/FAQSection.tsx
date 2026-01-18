'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ExternalLink } from 'lucide-react';
import { faqs, type FAQ } from '@/lib/help-data';

interface FAQSectionProps {
    category?: 'getting-started' | 'vms' | 'solar' | 'billing' | 'account' | 'all';
    searchable?: boolean;
}

export function FAQSection({ category = 'all', searchable = true }: FAQSectionProps) {
    const [searchQuery, setSearchQuery] = useState('');

    // Filter FAQs by category and search query
    const filteredFAQs = faqs.filter(faq => {
        const matchesCategory = category === 'all' || faq.category === category;
        const matchesSearch = searchQuery === '' ||
            faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
            faq.answer.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesCategory && matchesSearch;
    });

    const getCategoryLabel = (cat: FAQ['category']) => {
        const labels = {
            'getting-started': 'Getting Started',
            'vms': 'Virtual Machines',
            'solar': 'Solar Monitoring',
            'billing': 'Billing & Pricing',
            'account': 'Account & Security',
        };
        return labels[cat];
    };

    return (
        <div className="space-y-6">
            {searchable && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search frequently asked questions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
            )}

            {filteredFAQs.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-muted-foreground">No FAQs found matching your search.</p>
                    <Button
                        variant="link"
                        onClick={() => setSearchQuery('')}
                        className="mt-2"
                    >
                        Clear search
                    </Button>
                </div>
            ) : (
                <Accordion type="single" collapsible className="w-full">
                    {filteredFAQs.map((faq) => (
                        <AccordionItem key={faq.id} value={faq.id}>
                            <AccordionTrigger className="text-left hover:no-underline">
                                <div className="flex items-start gap-3 pr-4">
                                    {category === 'all' && (
                                        <Badge variant="outline" className="shrink-0">
                                            {getCategoryLabel(faq.category)}
                                        </Badge>
                                    )}
                                    <span className="font-medium">{faq.question}</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground">
                                <div className="pt-2 space-y-4">
                                    <p className="leading-relaxed">{faq.answer}</p>

                                    {faq.relatedLinks && faq.relatedLinks.length > 0 && (
                                        <div className="border-t pt-4">
                                            <p className="text-sm font-medium mb-2">Related Resources:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {faq.relatedLinks.map((link, idx) => (
                                                    <Link
                                                        key={idx}
                                                        href={link.href}
                                                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                                    >
                                                        {link.title}
                                                        <ExternalLink className="h-3 w-3" />
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            )}
        </div>
    );
}
