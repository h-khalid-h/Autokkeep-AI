
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/PUT /api/user/preferences — User Channel Preferences
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { getUserChannelPreference, setUserChannelPreference } from '@/lib/user-channel-prefs';
import { rateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';
import { parseBody, schemas } from '@/lib/validation';

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

export async function PUT(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'user-prefs-write' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    const result = await parseBody(request, schemas.userPreferences);
    if (!result.success) return result.error;
    const { entityId, channel, identifier } = result.data;

    // Validate entity access
    if (!entityIds.includes(entityId)) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    await setUserChannelPreference(db, user.id, entityId, channel, identifier);

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
