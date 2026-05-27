import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Settings — Autokkeep',
  description: 'Manage integrations, billing, and team members. Connect banks, ledgers, and communication channels.',
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
