import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

export const metadata: Metadata = {
  title: 'Blog | Autokkeep — AI Financial Operations Insights',
  description: 'Expert insights on AI-powered financial operations, small business automation, and the future of accounting technology.',
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
