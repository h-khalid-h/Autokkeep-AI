import AuthGuard from '@/components/auth/AuthGuard';

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
