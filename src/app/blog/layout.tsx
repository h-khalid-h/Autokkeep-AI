import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

export const metadata: Metadata = {
  title: 'Blog | Autokkeep — AI Bookkeeping Insights',
  description: 'Expert insights on AI bookkeeping automation, CPA firm efficiency, and the future of accounting technology.',
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
