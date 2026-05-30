import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Autokkeep',
  description:
    'Read the Autokkeep Terms of Service. Learn about our AI-powered bookkeeping platform policies, user responsibilities, billing, data ownership, and more.',
  openGraph: {
    title: 'Terms of Service — Autokkeep',
    description:
      'Read the Autokkeep Terms of Service covering platform usage, billing, data ownership, liability, and governing law.',
    type: 'website',
  },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
