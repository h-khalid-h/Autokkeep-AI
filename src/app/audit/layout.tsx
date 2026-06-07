import type { Metadata } from 'next';
import AuthGuard from '@/components/auth/AuthGuard';

export const metadata: Metadata = {
  title: 'Audit Log — Autokkeep',
  description: 'View the complete audit trail of all actions taken across your organization. SOC 2 and SOX compliant.',
};

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
