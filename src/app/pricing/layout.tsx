import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — Autokkeep',
  description:
    'Simple, transparent pricing for AI-powered financial operations. Plans starting at $29/month for solopreneurs, scaling to $299/month for multi-entity businesses. No per-seat charges. 14-day free trial.',
  openGraph: {
    title: 'Pricing — Autokkeep',
    description:
      'Simple, transparent pricing. Plans from $29/month to $299/month. No per-seat charges, no hidden fees. Start free — 14-day trial on any plan.',
    type: 'website',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
