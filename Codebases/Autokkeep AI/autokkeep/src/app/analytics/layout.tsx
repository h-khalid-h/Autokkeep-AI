import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Analytics — Autokkeep',
  description: 'View transaction volume, AI accuracy metrics, category breakdown, and financial performance over time.',
};

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
