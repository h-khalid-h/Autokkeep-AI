import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Autokkeep',
  description: 'Autokkeep Terms of Service. Our terms govern your use of the Autokkeep AI bookkeeping platform.',
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
