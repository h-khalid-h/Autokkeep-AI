import AuthGuard from '@/components/auth/AuthGuard';

export default function ChartOfAccountsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
