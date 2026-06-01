import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'AI Financial Analyst — Autokkeep',
  description: 'Ask questions about your finances in plain English. Get instant answers with data-backed insights from your AI Financial Analyst.',
};

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
