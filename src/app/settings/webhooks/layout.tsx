import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Webhook Settings — Autokkeep',
  description: 'Manage webhook subscriptions, configure event notifications, and monitor delivery status.',
};

export default function WebhooksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
