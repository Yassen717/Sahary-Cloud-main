"use client";

import { motion } from "motion/react";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

export default function AboutSection() {
  return (
    <section id="about" className="py-20 overflow-x-clip">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative rounded-2xl overflow-hidden"
          >
            <div className="relative h-[400px] md:h-[500px]">
              <Image
                src="/assets/images/Solar-eng.webp"
                alt="Solar panels in Libya"
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover rounded-2xl"
              />
            </div>
            <div className="absolute bottom-0 left-0 w-full bg-linear-to-t from-black/60 to-transparent p-8">
              <span className="text-white text-sm font-medium px-3 py-1 rounded-full bg-primary">
                Sustainable Technology
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              <span className="text-primary">Solar-Powered</span> Web Hosting in Libya
            </h2>

            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
              At Sahary Cloud, we&apos;re pioneering sustainable hosting in North Africa. We turn Libya&apos;s abundant sunshine into fast, reliable web hosting for founders and small businesses across the Arabic-speaking world — eco-friendly without compromising on performance or simplicity.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-primary shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg">Environmental Responsibility</h3>
                  <p className="text-gray-600 dark:text-gray-400">Our solar infrastructure reduces CO2 emissions by over 95% compared to traditional data centers.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-primary shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg">Built for the Region</h3>
                  <p className="text-gray-600 dark:text-gray-400">Simple shared hosting designed for Arabic-speaking founders and small businesses, with English support included.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-primary shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg">Local Expertise</h3>
                  <p className="text-gray-600 dark:text-gray-400">Our team of Libyan engineers and technicians provide support with deep knowledge of local conditions and requirements.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-secondary p-4 rounded-lg">
                <div className="text-3xl font-bold text-primary mb-1">100%</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Solar Powered</div>
              </div>

              <div className="bg-secondary p-4 rounded-lg">
                <div className="text-3xl font-bold text-primary mb-1">99.9%</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Uptime Guarantee</div>
              </div>

              <div className="bg-secondary p-4 rounded-lg">
                <div className="text-3xl font-bold text-primary mb-1">24/7</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Technical Support</div>
              </div>

              <div className="bg-secondary p-4 rounded-lg">
                <div className="text-3xl font-bold text-primary mb-1">5+</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Years Experience</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}