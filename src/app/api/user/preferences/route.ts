
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/PUT /api/user/preferences — User Channel Preferences
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { getUserChannelPreference, setUserChannelPreference } from '@/lib/user-channel-prefs';
import { rateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';

// ─── GET: Return current user's channel preference for entity ───────────────

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'user-prefs-read' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    const entityId = new URL(request.url).searchParams.get('entityId');

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    // Validate entity access
    if (!entityIds.includes(entityId)) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    const preference = await getUserChannelPreference(db, user.id, entityId);

    return NextResponse.json({ preference });
  } catch (error) {
    console.error('[UserPreferences] Error:', error);
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

// ─── PUT: Update user's channel preference ──────────────────────────────────

interface UpdatePreferenceBody {
  entityId: string;
  channel: string;
  identifier: string;
}

export async function PUT(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'user-prefs-write' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    let body: UpdatePreferenceBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { entityId, channel, identifier } = body;

    if (!entityId || !channel || !identifier) {
      return NextResponse.json(
        { error: 'entityId, channel, and identifier are required' },
        { status: 400 }
      );
    }

    // Validate entity access
    if (!entityIds.includes(entityId)) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Validate channel type
    const validChannels = ['sms', 'whatsapp', 'slack', 'email', 'teams'];
    if (!validChannels.includes(channel.toLowerCase())) {
      return NextResponse.json(
        { error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` },
        { status: 400 }
      );
    }

    await setUserChannelPreference(db, user.id, entityId, channel.toLowerCase(), identifier);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[UserPreferences] Error:', error);
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
