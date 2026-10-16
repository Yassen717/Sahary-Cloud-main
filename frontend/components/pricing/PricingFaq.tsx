import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqs = [
  {
    question: 'What kind of websites can I host?',
    answer:
      'Sahary Cloud hosts static websites — HTML, CSS, JavaScript and assets — which covers landing pages, portfolios, documentation and most small-business sites. Every account gets a free yourname.sahary.cloud subdomain, a MySQL database and FTP access.',
  },
  {
    question: 'Can I use my own custom domain?',
    answer:
      'Yes. Add your domain from the hosting panel, prove ownership with a DNS TXT record, and we issue and renew a free Let\u2019s Encrypt SSL certificate automatically. The number of custom domains depends on your plan.',
  },
  {
    question: 'How does billing work? Can I cancel anytime?',
    answer:
      'Plans are billed monthly in USD through Stripe — no contracts and no hidden fees. You can cancel anytime from your dashboard; your hosting stays active until the end of the current billing period.',
  },
  {
    question: 'What happens when I reach my plan limits?',
    answer:
      'Your dashboard shows live disk and bandwidth meters and we warn you at 80% usage. If bandwidth hits 100% your site is paused until the next monthly cycle; when disk is full, uploads are blocked. You can upgrade to a bigger plan at any time.',
  },
  {
    question: 'How do I get support?',
    answer:
      'Our team in Libya is available around the clock via the contact page and email, in Arabic and English. Higher plans include priority support.',
  },
];

export function PricingFaq() {
  return (
    <Accordion type="single" collapsible className="w-full">
      {faqs.map((faq, index) => (
        <AccordionItem key={faq.question} value={`faq-${index}`}>
          <AccordionTrigger className="text-start">
            {faq.question}
          </AccordionTrigger>
          <AccordionContent className="text-gray-600 dark:text-gray-400">
            {faq.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
