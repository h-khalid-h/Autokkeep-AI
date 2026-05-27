import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Setup — Autokkeep',
  description: 'Get your autonomous bookkeeping engine running in under 5 minutes. Connect your bank, ledger, and communication channel.',
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
