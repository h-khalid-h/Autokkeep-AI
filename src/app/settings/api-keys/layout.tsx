import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Keys — Autokkeep',
  description: 'Manage API keys for programmatic access to your Autokkeep data.',
};

export default function ApiKeysLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
