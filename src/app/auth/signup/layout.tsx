import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up — Autokkeep',
  description: 'Create your Autokkeep account. Start understanding your business finances with AI-powered financial operations.',
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
