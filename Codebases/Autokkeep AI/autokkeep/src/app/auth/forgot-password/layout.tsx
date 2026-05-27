import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Forgot Password — Autokkeep',
  description: 'Reset your Autokkeep password. We\'ll send a recovery link to your email.',
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
