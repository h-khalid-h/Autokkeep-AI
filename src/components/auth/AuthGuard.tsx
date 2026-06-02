'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import guardStyles from './AuthGuard.module.css';

let _supabase: ReturnType<typeof createBrowserClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Client-side auth guard. Wraps protected pages to redirect
 * unauthenticated users to /auth/login.
 * 
 * Usage:
 * ```tsx
 * <AuthGuard>
 *   <DashboardContent />
 * </AuthGuard>
 * ```
 */
export default function AuthGuard({ children, fallback }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          // Store the intended destination for post-login redirect
          const currentPath = window.location.pathname;
          if (currentPath !== '/auth/login') {
            sessionStorage.setItem('autokkeep_redirect', currentPath);
          }
          router.replace('/auth/login');
          return;
        }

        setIsAuthenticated(true);
      } catch {
        router.replace('/auth/login');
      }
    }

    checkAuth();

    // Listen for auth state changes
    const supabase = getSupabase();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        router.replace('/auth/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // Loading state
  if (isAuthenticated === null) {
    return fallback || (
      <div className={guardStyles.guardLoading}>
        <div className={guardStyles.guardInner}>
          <div className={guardStyles.guardLogo}>
            AK
          </div>
          <div className="text-caption">Loading...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
