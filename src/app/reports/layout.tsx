import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Financial Reports — Autokkeep',
  description: 'Generate and export Profit & Loss statements and Balance Sheets for your business entities.',
};

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
