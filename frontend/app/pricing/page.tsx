import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Sun } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchHostingPlans } from '@/components/pricing/fetch-plans';
import { PricingPlans } from '@/components/pricing/PricingPlans';
import { PricingFaq } from '@/components/pricing/PricingFaq';

export const metadata: Metadata = {
  title: 'Hosting Plans & Pricing',
  description:
    'Simple monthly pricing for solar-powered shared hosting: free sahary.cloud subdomain, custom domains with free SSL, MySQL, FTP and a web file manager. Billed in USD via Stripe.',
  openGraph: {
    title: 'Hosting Plans & Pricing | Sahary Cloud',
    description:
      'Solar-powered web hosting with a free subdomain, custom domains, free SSL, MySQL and FTP — billed monthly in USD via Stripe.',
  },
};

function PlansSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-96 w-full rounded-xl" />
      ))}
    </div>
  );
}

export default async function PricingPage() {
  const plans = await fetchHostingPlans();

  return (
    <div className="py-16">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <Badge className="mb-4 bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400">
            <Sun className="me-1 h-3 w-3" aria-hidden="true" />
            Powered by solar energy
          </Badge>
          <h1 className="mb-4 text-3xl font-bold md:text-5xl">
            Hosting plans for every site
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Solar-powered shared hosting with a free sahary.cloud subdomain,
            custom domains, free SSL, MySQL and FTP — managed from one clean
            control panel.
          </p>
        </div>

        <Suspense fallback={<PlansSkeleton />}>
          <PricingPlans plans={plans} />
        </Suspense>

        <section
          aria-labelledby="billing-note"
          className="mx-auto mt-16 max-w-3xl text-center"
        >
          <h2 id="billing-note" className="sr-only">
            Billing
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            All plans are billed monthly in USD through Stripe — cancel anytime
            from your dashboard.
          </p>
        </section>

        <section
          aria-labelledby="pricing-faq"
          className="mx-auto mt-16 max-w-3xl"
        >
          <h2
            id="pricing-faq"
            className="mb-6 text-center text-2xl font-bold md:text-3xl"
          >
            Frequently asked questions
          </h2>
          <PricingFaq />
        </section>
      </div>
    </div>
  );
}
