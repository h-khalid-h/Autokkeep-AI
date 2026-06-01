import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In — Autokkeep',
  description: 'Sign in to your Autokkeep account. AI-powered financial operations for modern businesses.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
