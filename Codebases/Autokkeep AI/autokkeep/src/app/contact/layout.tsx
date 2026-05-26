import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact — Autokkeep',
  description: 'Get in touch with the Autokkeep team. We\'re here to help with demos, partnerships, enterprise pricing, and technical support.',
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
