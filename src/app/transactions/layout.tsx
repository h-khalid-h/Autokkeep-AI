import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Transactions — Autokkeep',
  description: 'View, filter, and manage all transactions. Export to CSV, upload receipts, and review AI categorizations.',
};

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
