import HeroSection from '@/components/HeroSection';
import FeaturesSection from '@/components/FeaturesSection';
import AboutSection from '@/components/AboutSection';
import PricingSection from '@/components/PricingSection';
import SignupForm from '@/components/SignupForm';

export default function Home() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <FeaturesSection />
      <AboutSection />
      <PricingSection />
      <SignupForm />
    </div>
  );
}