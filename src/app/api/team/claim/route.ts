import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody, schemas } from '@/lib/validation';

/**
 * POST /api/team/claim
 *
 * Server-side invite claiming. Validates that the invite exists, is pending,
 * and matches the authenticated user's email before linking the user.
 *
 * Body: { inviteId: string }
 * Returns: { success: true, org_id: string } or error
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 claims per minute per IP
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'team-claim' });
    if (limited) return limited;

    const supabase = await createServerClient();

    // 1. Authenticate the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate request body
    const parsed = await parseBody(request, schemas.teamClaim);
    if (!parsed.success) return parsed.error;
    const { inviteId } = parsed.data;

    const db = supabase as unknown as SupabaseQueryClient;

    // 3. Fetch the invite record
    const { data: invite, error: fetchError } = await db
      .from('team_members')
      .select('id, org_id, role, invited_email, user_id, accepted_at')
      .eq('id', inviteId)
      .maybeSingle();

    if (fetchError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    // 4. Validate the invite is for the current user (by email)
    if (!user.email || invite.invited_email?.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: 'This invite is not for your account' }, { status: 403 });
    }

    // 5. Check if the invite is still pending (not already claimed)
    if (invite.user_id || invite.accepted_at) {
      // Already claimed — return the org_id so the client can redirect
      return NextResponse.json({ success: true, org_id: invite.org_id, alreadyClaimed: true });
    }

    // 6. Claim the invite: link user and set accepted timestamp
    const { error: updateError } = await db
      .from('team_members')
      .update({
        user_id: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', inviteId)
      .is('user_id', null); // Extra guard: only update if still unclaimed

    if (updateError) {
      console.error('[Team Claim] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to claim invite' }, { status: 500 });
    }

    return NextResponse.json({ success: true, org_id: invite.org_id });
  } catch (err) {
    console.error('[Team Claim] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
