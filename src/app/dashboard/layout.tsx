import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'Dashboard — Autokkeep',
  description: 'Review AI-categorized transactions, manage exceptions, and monitor your financial operations in real-time.',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      {/* Plaid Link SDK */}
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="lazyOnload"
      />
      {children}
    </AuthGuard>
  );
}
