import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Observability — Admin — Autokkeep',
  description: 'Rate limit monitoring and distributed trace viewer for Autokkeep platform.',
};

export default function ObservabilityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
