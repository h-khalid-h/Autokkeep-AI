import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import PricingSection from '@/components/landing/PricingSection';
import CTASection from '@/components/landing/CTASection';

export const metadata: Metadata = {
  title: 'Pricing — Autokkeep',
  description: 'Simple, transparent pricing for AI-powered financial operations. Start free, scale as you grow. Plans from $29/month.',
};
export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main>
        <div style={{ paddingTop: 'var(--header-height)' }} data-scroll-reveal>
          <PricingSection />
          <CTASection />
        </div>
      </main>
      <Footer />
    </>
  );
}
