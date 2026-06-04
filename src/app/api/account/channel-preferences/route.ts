// GET/PUT /api/account/channel-preferences — Fetch/upsert user channel preferences
import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody, schemas } from '@/lib/validation';
import { getApiAuthContext } from '@/lib/api-auth';

interface ChannelPrefRow {
  entity_id: string;
  preferred_channel: string;
  channel_identifier: string | null;
  is_active: boolean;
}

/**
 * GET /api/account/channel-preferences
 * Returns the authenticated user's channel preferences across all entities.
 */
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'chan-prefs-get' });
    if (limited) return limited;

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = supabase as unknown as SupabaseQueryClient;
    const { data, error: fetchError } = await db
      .from('user_channel_preferences')
      .select('entity_id, preferred_channel, channel_identifier, is_active')
      .eq('user_id', user.id);

    if (fetchError) {
      console.error('[Channel Prefs GET]', fetchError);
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    const prefs = ((data as ChannelPrefRow[] | null) ?? []).map((row) => ({
      entityId: row.entity_id,
      preferredChannel: row.preferred_channel,
      channelIdentifier: row.channel_identifier,
      isActive: row.is_active,
    }));

    return NextResponse.json(prefs);
  } catch (error) {
    console.error('[Channel Prefs GET] Unexpected:', error);
    captureException(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/account/channel-preferences
 * Upserts the authenticated user's channel preference for a specific entity.
 * Accepts JSON body: { entityId: string, preferredChannel: string, channelIdentifier?: string }
 */
export async function PUT(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'chan-prefs-put' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    const parsed = await parseBody(request, schemas.channelPrefs);
    if (!parsed.success) return parsed.error;
    const { entityId, preferredChannel, channelIdentifier } = parsed.data;

    // IDOR guard: validate user has access to the requested entity
    if (!entityIds.includes(entityId)) {
      return NextResponse.json({ error: 'Entity not found or access denied' }, { status: 403 });
    }
    const { data, error: upsertError } = await db
      .from('user_channel_preferences')
      .upsert(
        {
          user_id: user.id,
          entity_id: entityId,
          preferred_channel: preferredChannel,
          channel_identifier: typeof channelIdentifier === 'string' ? channelIdentifier : null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,entity_id' }
      )
      .select('entity_id, preferred_channel, channel_identifier, is_active')
      .single();

    if (upsertError) {
      console.error('[Channel Prefs PUT]', upsertError);
      return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
    }

    const row = data as ChannelPrefRow | null;
    return NextResponse.json({
      entityId: row?.entity_id,
      preferredChannel: row?.preferred_channel,
      channelIdentifier: row?.channel_identifier,
      isActive: row?.is_active,
    });
  } catch (error) {
    console.error('[Channel Prefs PUT] Unexpected:', error);
    captureException(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
