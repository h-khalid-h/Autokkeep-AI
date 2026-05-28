import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Autokkeep',
  description:
    'Autokkeep Privacy Policy. Learn how we collect, use, and protect your data — including financial records, bank integrations (Plaid), payments (Stripe), and AI processing (OpenAI). GDPR & CCPA compliant.',
  openGraph: {
    title: 'Privacy Policy — Autokkeep',
    description:
      'Learn how Autokkeep handles your data, third-party integrations, security measures, and your privacy rights under GDPR and CCPA.',
    type: 'website',
  },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
