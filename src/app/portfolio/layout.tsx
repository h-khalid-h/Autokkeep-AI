import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Portfolio Overview — Autokkeep',
  description: 'Multi-entity portfolio dashboard. Monitor all your business entities, bank connections, and close readiness in one view.',
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      {children}
    </AuthGuard>
  );
}
