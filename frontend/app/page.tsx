import type { Metadata } from 'next';
import HeroSection from '@/components/HeroSection';
import FeaturesSection from '@/components/FeaturesSection';
import AboutSection from '@/components/AboutSection';
import PricingSection from '@/components/PricingSection';
import SignupForm from '@/components/SignupForm';
import { fetchHostingPlans } from '@/components/pricing/fetch-plans';

export const metadata: Metadata = {
  title: 'Solar-Powered Web Hosting',
  description:
    'Solar-powered shared web hosting from Libya: a free sahary.cloud subdomain, custom domains with free SSL, MySQL, FTP and a web file manager — built for founders and small businesses.',
  openGraph: {
    title: 'Solar-Powered Web Hosting | Sahary Cloud',
    description:
      'Launch your website on solar-powered shared hosting — free subdomain, custom domains with free SSL, MySQL and FTP.',
  },
};

export default async function Home() {
  const plans = await fetchHostingPlans();

  return (
    <div className="min-h-screen">
      <HeroSection />
      <FeaturesSection />
      <AboutSection />
      <PricingSection plans={plans} />
      <SignupForm />
    </div>
  );
}
