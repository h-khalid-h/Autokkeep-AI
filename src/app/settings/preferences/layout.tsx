import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Preferences — Autokkeep',
  description: 'Customize your appearance, regional settings, notifications, and dashboard layout.',
};

export default function PreferencesLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
