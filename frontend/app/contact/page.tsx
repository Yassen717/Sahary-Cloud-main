import type { Metadata } from "next";
import Link from "next/link";
import { Clock, HelpCircle, Mail, MapPin, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SignupForm from "@/components/SignupForm";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with the Sahary Cloud team for sales, support or partnerships.",
};

const channels = [
  {
    icon: Mail,
    title: "Email",
    description: "General enquiries and sales",
    value: "info@saharycloud.ly",
    href: "mailto:info@saharycloud.ly",
  },
  {
    icon: HelpCircle,
    title: "Support",
    description: "Technical help for existing customers",
    value: "support@saharycloud.com",
    href: "mailto:support@saharycloud.com",
  },
  {
    icon: Phone,
    title: "Phone",
    description: "Sunday – Thursday, 9:00 – 17:00 (Libya time)",
    value: "+218 92 209 456",
    href: "tel:+21892209456",
  },
  {
    icon: MapPin,
    title: "Office",
    description: "Visit us by appointment",
    value: "123 Tech Hub, Tripoli Business District, Libya",
  },
];

export default function ContactPage() {
  return (
    <div className="py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Contact Us</h1>
          <p className="text-lg text-muted-foreground">
            Questions about solar-powered hosting, pricing or your account? Our team in Libya is
            here to help.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {channels.map(({ icon: Icon, title, description, value, href }) => (
            <Card key={title} className="h-full">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                {href ? (
                  <a href={href} className="font-medium text-primary hover:underline break-words">
                    {value}
                  </a>
                ) : (
                  <p className="font-medium">{value}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="max-w-6xl mx-auto mt-8 flex flex-col sm:flex-row items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" aria-hidden="true" />
          <span>We usually reply within one business day.</span>
          <span className="hidden sm:inline">·</span>
          <span>
            Looking for quick answers? Visit the{" "}
            <Link href="/help" className="text-primary hover:underline">
              Help Center
            </Link>
            .
          </span>
        </div>
      </div>

      <SignupForm />
    </div>
  );
}
