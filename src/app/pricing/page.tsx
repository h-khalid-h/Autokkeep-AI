import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import PricingSection from '@/components/landing/PricingSection';
import CTASection from '@/components/landing/CTASection';

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main>
        <div style={{ paddingTop: 'var(--header-height)' }}>
          <PricingSection />
          <CTASection />
        </div>
      </main>
      <Footer />
    </>
  );
}
