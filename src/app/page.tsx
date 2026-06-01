import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import ProblemSection from '@/components/landing/ProblemSection';
import SolutionSection from '@/components/landing/SolutionSection';
import ArchitectureSection from '@/components/landing/ArchitectureSection';
import BusinessOwnerSection from '@/components/landing/BusinessOwnerSection';
import PricingSection from '@/components/landing/PricingSection';
import MetricsSection from '@/components/landing/MetricsSection';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <ProblemSection />
        <SolutionSection />
        <ArchitectureSection />
        <BusinessOwnerSection />
        <PricingSection />
        <MetricsSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
