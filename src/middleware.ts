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
  const { pathname } = request.nextUrl;

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
    } catch {
      // If the DB query fails, allow through rather than blocking
      // — AuthGuard and EntityProvider provide defense-in-depth
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
