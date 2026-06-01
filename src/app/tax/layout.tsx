import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Tax Readiness — Autokkeep',
  description: 'AI-powered tax readiness analysis with deduction tracking, receipt compliance scoring, and estimated savings.',
};

export default function TaxLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
