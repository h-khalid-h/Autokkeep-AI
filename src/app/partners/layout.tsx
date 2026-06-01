import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'For Accounting Professionals — Autokkeep',
  description: 'Partner with Autokkeep to 4x your client capacity. AI-powered financial operations designed for CPA firms and accounting professionals.',
  openGraph: {
    title: 'For Accounting Professionals — Autokkeep',
    description: 'AI-powered financial operations platform designed for CPA firms. Automate bookkeeping, scale your practice, and deliver more value to clients.',
    type: 'website',
  },
};

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
