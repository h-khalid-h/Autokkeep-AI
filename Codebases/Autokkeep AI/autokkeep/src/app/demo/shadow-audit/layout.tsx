import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shadow Audit Demo — Autokkeep',
  description: 'Upload a CSV of transactions and watch Autokkeep categorize them in seconds. See our dual-engine AI in action.',
};

export default function ShadowAuditLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
