import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next') ?? '/onboarding';
  // Validate redirect target to prevent open redirect attacks
  const next = (nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/\\'))
    ? nextParam
    : '/onboarding';

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        // Validate forwardedHost against the configured app URL to prevent open redirects
        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        const allowedHost = appUrl ? new URL(appUrl).host : null;
        if (allowedHost && forwardedHost === allowedHost) {
          return NextResponse.redirect(`https://${forwardedHost}${next}`);
        }
        // Untrusted forwarded host — fall back to origin
        return NextResponse.redirect(`${origin}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Return the user to the error page with the error code
  return NextResponse.redirect(`${origin}/auth/error?error_code=auth_callback_error&error_description=Authentication+failed.+Please+try+signing+in+again.`);
}
