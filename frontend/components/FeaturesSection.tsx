"use client";

import { motion, type Variants } from "motion/react";
import { Sun, Globe, ShieldCheck, FolderOpen, Database, Upload, Gauge, LifeBuoy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: <Sun className="h-12 w-12 mb-6 text-primary" />,
    title: "Solar Powered",
    description: "Every website we host runs on 100% clean solar energy — fast for visitors, kind to the planet."
  },
  {
    icon: <Globe className="h-12 w-12 mb-6 text-primary" />,
    title: "Free Subdomain",
    description: "Your site is live in minutes on your own yourname.sahary.cloud subdomain — no DNS setup needed."
  },
  {
    icon: <ShieldCheck className="h-12 w-12 mb-6 text-primary" />,
    title: "Custom Domains & Free SSL",
    description: "Bring your own domain, verify it with a DNS record, and get a free SSL certificate that renews itself."
  },
  {
    icon: <FolderOpen className="h-12 w-12 mb-6 text-primary" />,
    title: "Web File Manager",
    description: "Upload, edit, rename and organize your site files right in the browser — no extra tools needed."
  },
  {
    icon: <Database className="h-12 w-12 mb-6 text-primary" />,
    title: "MySQL Databases",
    description: "A managed MySQL database for every account, with credentials one click away in your panel."
  },
  {
    icon: <Upload className="h-12 w-12 mb-6 text-primary" />,
    title: "FTP Access",
    description: "Prefer FTP? Publish with your favorite client using your own credentials and one-click password resets."
  },
  {
    icon: <Gauge className="h-12 w-12 mb-6 text-primary" />,
    title: "Live Usage Meters",
    description: "Disk and bandwidth usage tracked in real time with clear warnings before you hit a limit."
  },
  {
    icon: <LifeBuoy className="h-12 w-12 mb-6 text-primary" />,
    title: "Local Support",
    description: "24/7 help from our team in Libya, in Arabic and English — real people, real answers."
  }
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants: Variants = {
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
      <div className="absolute inset-0 bg-linear-to-b from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20" />
      
      <div className="container mx-auto px-4 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Why Choose Sahary Cloud
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            Everything you need to put a website online — simple shared hosting
            that runs on clean solar energy.
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
              <div className="absolute inset-0 bg-linear-to-r from-primary/10 to-primary/20 rounded-2xl transform group-hover:scale-105 transition-transform duration-300" />
              <Card className="relative h-full border-none shadow-lg hover:shadow-xl transition-shadow duration-300 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xs">
                <CardHeader className="pt-8 flex flex-col items-center text-center">
                  <motion.div
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.6 }}
                    className="transform group-hover:scale-110 transition-transform duration-300"
                  >
                    {feature.icon}
                  </motion.div>
                  <CardTitle className="text-xl bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
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