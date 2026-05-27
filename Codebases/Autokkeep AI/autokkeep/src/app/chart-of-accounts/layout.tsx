import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Chart of Accounts — Autokkeep',
  description: 'Manage your General Ledger codes. Add, edit, and organize GL accounts for automated transaction categorization.',
};

export default function ChartOfAccountsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
