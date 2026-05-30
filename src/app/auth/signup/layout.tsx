import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up — Autokkeep',
  description: 'Create your Autokkeep account. Start automating your bookkeeping with AI-powered transaction categorization.',
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
