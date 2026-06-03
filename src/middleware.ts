import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const protectedRoutes = [
  '/dashboard',
  '/settings',
  '/analytics',
  '/onboarding',
  '/transactions',
  '/chart-of-accounts',
  '/account',
  '/close',
  '/health',
  '/insights',
  '/portfolio',
  '/tax',
  '/admin',
];
const authRoutes = ['/auth/login', '/auth/signup'];

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request);
  const { pathname, searchParams } = request.nextUrl;

  // Intercept auth errors on any non-error page (e.g., expired email links redirect to /)
  // Supabase redirects to the app URL with ?error=... or ?error_code=... params
  if (pathname !== '/auth/error') {
    const authError = searchParams.get('error');
    const authErrorCode = searchParams.get('error_code');
    if (authError || authErrorCode) {
      const errorUrl = request.nextUrl.clone();
      errorUrl.pathname = '/auth/error';
      // Preserve the error params for the error page to display
      return NextResponse.redirect(errorUrl);
    }
  }

  // Redirect unauthenticated users away from protected routes
  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users without an org to onboarding.
  // Skip this check on /onboarding itself to avoid redirect loops.
  const isOnboarding = pathname === '/onboarding' || pathname.startsWith('/onboarding/');
  const isAppRoute = isProtected && !isOnboarding;

  if (isAppRoute && user && supabase) {
    try {
      const { data: membership } = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!membership) {
        const onboardingUrl = request.nextUrl.clone();
        onboardingUrl.pathname = '/onboarding';
        return NextResponse.redirect(onboardingUrl);
      }

      // Admin route protection: only owners can access /admin
      const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
      if (isAdminRoute) {
        const { data: memberRole } = await supabase
          .from('team_members')
          .select('role')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (memberRole?.role !== 'owner') {
          const dashboardUrl = request.nextUrl.clone();
          dashboardUrl.pathname = '/dashboard';
          return NextResponse.redirect(dashboardUrl);
        }
      }
    } catch (error) {
      // SECURITY: Fail-closed — redirect to onboarding on DB failure.
      // Rationale: If we can't verify org membership, we must NOT let the
      // user into protected routes. Redirecting to onboarding is safe because:
      //   1. Onboarding gracefully handles users who already have an org
      //   2. It prevents access to sensitive data when DB is unavailable
      //   3. This follows the principle of least privilege — deny by default
      console.error('[Middleware] DB query failed during membership check:', error);
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = '/onboarding';
      return NextResponse.redirect(onboardingUrl);
    }
  }

  // Redirect authenticated users away from auth routes
  const isAuthRoute = authRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isAuthRoute && user) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
