
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/PUT/DELETE /api/settings/preferences — User Preferences API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import {
  getPreferences,
  updatePreferences,
  resetPreferences,
  type PreferencesDB,
} from '@/lib/preferences/engine';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'prefs-get' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db } = ctx;

    const prefs = await getPreferences(db as unknown as PreferencesDB, user.id);
    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    return handleApiError(error, 'GET /api/settings/preferences', 'Failed to fetch preferences');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'prefs-put' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db } = ctx;

    const body = await request.json();

    // Validate body — only allow known fields
    const allowedFields = [
      'theme', 'locale', 'currency', 'timezone',
      'dateFormat', 'numberFormat',
      'notificationPreferences', 'dashboardLayout',
    ];

    const filtered: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        filtered[key] = body[key];
      }
    }

    if (Object.keys(filtered).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided' },
        { status: 400 }
      );
    }

    const prefs = await updatePreferences(
      db as unknown as PreferencesDB,
      user.id,
      filtered
    );

    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    return handleApiError(error, 'PUT /api/settings/preferences', 'Failed to update preferences');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'prefs-del' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db } = ctx;

    const prefs = await resetPreferences(db as unknown as PreferencesDB, user.id);
    return NextResponse.json({ preferences: prefs, message: 'Preferences reset to defaults' });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/settings/preferences', 'Failed to reset preferences');
  }
}
