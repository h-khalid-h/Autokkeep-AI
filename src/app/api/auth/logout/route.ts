import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'logout' });
    if (limited) return limited;

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    // Capture user ID before sign-out for audit logging
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    const { error } = await supabase.auth.signOut();
    if (error) {
      return NextResponse.json({ error: 'Logout failed' }, { status: 400 });
    }

    // Audit log the logout event (SOC 2)
    if (userId) {
      await writeAuditLog({
        supabase: supabase as unknown as SupabaseQueryClient,
        entityId: undefined,
        actorId: userId,
        actorType: 'human',
        action: 'logout',
        targetType: 'session',
        details: {},
        request,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Auth Logout] Error:', err);
    captureException(err);
    return NextResponse.json({ error: 'Failed to sign out' }, { status: 500 });
  }
}
