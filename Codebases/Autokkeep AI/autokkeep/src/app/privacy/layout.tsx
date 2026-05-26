import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Autokkeep',
  description: 'Autokkeep Privacy Policy. Learn how we collect, use, and protect your financial data. GDPR compliant with data deletion and portability rights.',
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
