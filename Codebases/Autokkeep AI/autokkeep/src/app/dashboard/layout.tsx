import AuthGuard from '@/components/auth/AuthGuard';
import Script from 'next/script';

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
