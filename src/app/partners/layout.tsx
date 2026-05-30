import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Partners — Autokkeep',
  description: 'Partner with Autokkeep to 4x your client capacity. AI-powered bookkeeping designed for CPA firms.',
};

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
