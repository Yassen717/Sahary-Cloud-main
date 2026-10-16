"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlanCards } from "@/components/pricing/PlanCards";
import type { HostingPlanDTO } from "@/lib/hosting-types";

interface PricingSectionProps {
  /** Plans fetched server-side; `null` means the API could not be reached. */
  plans: HostingPlanDTO[] | null;
}

export default function PricingSection({ plans }: PricingSectionProps) {
  return (
    <section id="plans" className="py-20 bg-secondary dark:bg-secondary/10">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-4xl font-bold mb-4"
          >
            Hosting plans for every site
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto"
          >
            Simple monthly pricing for solar-powered shared hosting — billed in
            USD via Stripe, cancel anytime.
          </motion.p>
        </div>

        {plans && plans.length > 0 ? (
          <>
            <PlanCards
              plans={plans}
              action={(plan) => (
                <Button asChild className="w-full">
                  <Link href={`/pricing?plan=${encodeURIComponent(plan.id)}`}>
                    Choose plan
                  </Link>
                </Button>
              )}
            />
            <div className="mt-10 text-center">
              <Link
                href="/pricing"
                className="text-primary hover:underline font-medium"
              >
                Compare plans and FAQs on the pricing page
              </Link>
            </div>
          </>
        ) : (
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {plans === null
                ? 'Our hosting plans are temporarily unavailable — please check back soon.'
                : 'Our hosting plans are not open for purchase yet — check back soon.'}
            </p>
            <Button asChild variant="outline">
              <Link href="/pricing">View pricing page</Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
