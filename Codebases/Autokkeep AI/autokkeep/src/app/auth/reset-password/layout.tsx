import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password — Autokkeep',
  description: 'Set a new password for your Autokkeep account.',
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
