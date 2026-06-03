import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication Error | Autokkeep',
  description:
    'An authentication error occurred. Follow the instructions to resolve the issue and sign in.',
};

export default function AuthErrorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
