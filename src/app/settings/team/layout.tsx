import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Management — Autokkeep',
  description: 'Manage team members, roles, and invitations for your organization.',
};

export default function TeamSettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
