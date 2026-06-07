'use client';

import { useLanding } from '@/lib/context/LandingContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import SocialProof from '@/components/landing/SocialProof';
import HowItWorks from '@/components/landing/HowItWorks';
import FeaturesGrid from '@/components/landing/FeaturesGrid';
import PricingSection from '@/components/landing/PricingSection';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  const { dir } = useLanding();
  const scrollRef = useScrollReveal({ threshold: 0.1 });

  return (
    <div dir={dir} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main ref={scrollRef as React.RefObject<HTMLElement>} style={{ flex: 1 }}>
        <Hero />
        <SocialProof />
        <HowItWorks />
        <FeaturesGrid />
        <PricingSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
