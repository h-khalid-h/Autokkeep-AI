import { NextRequest, NextResponse } from 'next/server';
import { authLimiter } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const limit = authLimiter(request);
    if (limit && !limit.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    const { error } = await supabase.auth.signOut();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Auth Logout] Error:', err);
    return NextResponse.json({ error: 'Failed to sign out' }, { status: 500 });
  }
}
