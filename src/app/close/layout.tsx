import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Month-End Close — Autokkeep',
  description: 'AI-powered month-end close process with automated reconciliation, receipt auditing, and readiness scoring.',
};

export default function CloseLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
