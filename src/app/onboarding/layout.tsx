import type { Metadata } from 'next';
import Script from 'next/script';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Setup — Autokkeep',
  description: 'Get your autonomous bookkeeping engine running in under 5 minutes. Connect your bank, ledger, and communication channel.',
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      {/* Plaid Link SDK — needed for bank connection step */}
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="lazyOnload"
      />
      {children}
    </AuthGuard>
  );
}
