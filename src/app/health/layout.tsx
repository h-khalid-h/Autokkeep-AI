import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Financial Health — Autokkeep',
  description: 'Monitor your financial health with real-time anomaly detection, duplicate payment alerts, and cash flow analysis.',
};

export default function HealthLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
