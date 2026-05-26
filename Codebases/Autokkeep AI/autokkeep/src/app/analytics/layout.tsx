import AuthGuard from '@/components/auth/AuthGuard';

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
