import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

export const metadata: Metadata = {
  title: 'Admin — Autokkeep',
  description: 'Platform administration dashboard for Autokkeep AI.',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not logged in → login
  if (!user) {
    redirect('/auth/login');
  }

  // Logged in but not admin → dashboard
  if (!isAdminEmail(user.email)) {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
