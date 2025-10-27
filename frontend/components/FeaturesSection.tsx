"use client";

import { motion } from "framer-motion";
import { Server, Cloud, ShieldCheck, Zap, Cpu, Clock, Globe, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: <Server className="h-12 w-12 mb-6 text-primary" />,
    title: "Cloud VPS",
    description: "High-performance virtual private servers powered by 100% renewable solar energy."
  },
  {
    icon: <Cloud className="h-12 w-12 mb-6 text-primary" />,
    title: "Scalable Resources",
    description: "Dynamically scale your resources up or down based on your needs with instant provisioning."
  },
  {
    icon: <ShieldCheck className="h-12 w-12 mb-6 text-primary" />,
    title: "Advanced Security",
    description: "Enterprise-grade security with DDoS protection and regular security updates."
  },
  {
    icon: <Zap className="h-12 w-12 mb-6 text-primary" />,
    title: "High Performance",
    description: "NVMe SSD storage and latest-gen processors for lightning-fast performance."
  },
  {
    icon: <Cpu className="h-12 w-12 mb-6 text-primary" />,
    title: "Dedicated Resources",
    description: "Guaranteed CPU, RAM, and storage resources exclusively for your workloads."
  },
  {
    icon: <Clock className="h-12 w-12 mb-6 text-primary" />,
    title: "99.9% Uptime",
    description: "Enterprise-grade reliability with advanced battery backup systems."
  },
  {
    icon: <Globe className="h-12 w-12 mb-6 text-primary" />,
    title: "Local Support",
    description: "24/7 expert technical support from our team in Libya."
  },
  {
    icon: <RefreshCw className="h-12 w-12 mb-6 text-primary" />,
    title: "Automated Backups",
    description: "Daily automated backups with point-in-time recovery options."
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut"
    }
  }
};

export default function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-secondary/50 dark:bg-secondary/10 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20" />
      
      <div className="container mx-auto px-4 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Why Choose Sahary Cloud
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            Experience the perfect blend of performance, sustainability, and reliability
            with our cutting-edge cloud infrastructure.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/20 rounded-2xl transform group-hover:scale-105 transition-transform duration-300" />
              <Card className="relative h-full border-none shadow-lg hover:shadow-xl transition-shadow duration-300 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                <CardHeader className="pt-8 flex flex-col items-center text-center">
                  <motion.div
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.6 }}
                    className="transform group-hover:scale-110 transition-transform duration-300"
                  >
                    {feature.icon}
                  </motion.div>
                  <CardTitle className="text-xl bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}