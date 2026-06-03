// GET/PUT /api/account/channel-preferences — Fetch/upsert user channel preferences
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { rateLimit } from '@/lib/rate-limit';

const VALID_CHANNELS = ['slack', 'sms', 'whatsapp', 'email', 'teams'] as const;
type ValidChannel = typeof VALID_CHANNELS[number];

function isValidChannel(value: unknown): value is ValidChannel {
  return typeof value === 'string' && VALID_CHANNELS.includes(value as ValidChannel);
}

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

    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { entityId, preferredChannel, channelIdentifier } = body as {
      entityId?: string;
      preferredChannel?: string;
      channelIdentifier?: string;
    };

    if (!entityId || typeof entityId !== 'string') {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
    }

    if (!isValidChannel(preferredChannel)) {
      return NextResponse.json(
        { error: `preferredChannel must be one of: ${VALID_CHANNELS.join(', ')}` },
        { status: 400 }
      );
    }

    const db = supabase as unknown as SupabaseQueryClient;
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
