import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Documentation — Autokkeep',
  description:
    'Explore the Autokkeep Public API v1. Integrate bookkeeping automation, retrieve transactions, generate financial reports, and manage webhooks programmatically.',
  openGraph: {
    title: 'API Documentation — Autokkeep',
    description:
      'Explore the Autokkeep Public API v1. Integrate bookkeeping automation, retrieve transactions, generate financial reports, and manage webhooks programmatically.',
  },
};

export default function DevelopersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
