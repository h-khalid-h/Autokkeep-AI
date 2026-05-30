import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'logout' });
    if (limited) return limited;

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    const { error } = await supabase.auth.signOut();
    if (error) {
      return NextResponse.json({ error: 'Logout failed' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Auth Logout] Error:', err);
    return NextResponse.json({ error: 'Failed to sign out' }, { status: 500 });
  }
}
