import AuthGuard from '@/components/auth/AuthGuard';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
