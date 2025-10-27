"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

const pricingPlans = [
  {
    name: "Basic",
    price: "29",
    description: "Perfect for small projects and websites",
    features: [
      "1 vCPU Core",
      "2GB RAM",
      "30GB SSD Storage",
      "1TB Bandwidth",
      "1 IPv4 Address",
      "Daily Backups",
      "Basic Support",
      "99.9% Uptime"
    ],
    popular: false,
    cta: "Sign Up"
  },
  {
    name: "Standard",
    price: "59",
    description: "Ideal for growing businesses and applications",
    features: [
      "2 vCPU Cores",
      "4GB RAM",
      "60GB SSD Storage",
      "2TB Bandwidth",
      "1 IPv4 Address",
      "Daily Backups",
      "Priority Support",
      "99.9% Uptime",
      "Free Domain"
    ],
    popular: true,
    cta: "Sign Up"
  },
  {
    name: "Premium",
    price: "99",
    description: "For high-demand applications and services",
    features: [
      "4 vCPU Cores",
      "8GB RAM",
      "120GB SSD Storage",
      "4TB Bandwidth",
      "2 IPv4 Addresses",
      "Daily Backups",
      "24/7 Priority Support",
      "99.9% Uptime",
      "Free Domain",
      "DDoS Protection"
    ],
    popular: false,
    cta: "Sign Up"
  }
];

export default function PricingSection() {
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
            Choose Your Solar VPS Plan
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto"
          >
            Affordable and sustainable VPS solutions for every need
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pricingPlans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className={`h-full overflow-hidden ${plan.popular ? 'border-2 border-primary dark:border-primary relative shadow-xl' : 'shadow-lg'}`}>
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-primary text-white px-3 py-1 text-sm font-medium">
                    Most Popular
                  </div>
                )}
                <CardHeader className="text-center pt-8">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <div className="flex items-baseline justify-center my-4">
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="ml-1 text-gray-600 dark:text-gray-400">/month</span>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center">
                        <Check className="h-5 w-5 text-primary mr-2 shrink-0" />
                        <span className="text-gray-600 dark:text-gray-400">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    asChild
                    className={`w-full ${plan.popular ? 'bg-primary hover:bg-primary/90 text-white' : ''}`}
                    variant={plan.popular ? "default" : "outline"}
                  >
                    <Link href="#signup">{plan.cta}</Link>
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}