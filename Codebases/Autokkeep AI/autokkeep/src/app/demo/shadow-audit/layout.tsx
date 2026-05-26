import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shadow Audit Demo — Autokkeep',
  description: 'Upload a CSV and watch Autokkeep categorize transactions instantly. See AI-powered bookkeeping in action.',
};

export default function ShadowAuditLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
