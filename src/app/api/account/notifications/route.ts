// GET/PUT /api/account/notifications — Fetch/upsert notification preferences
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody, schemas } from '@/lib/validation';

interface NotificationPrefs {
  email: boolean;
  slack: boolean;
  sms: boolean;
}

const DEFAULTS: NotificationPrefs = { email: true, slack: false, sms: false };

/**
 * GET /api/account/notifications
 * Returns the authenticated user's notification preferences.
 */
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'notif-prefs-get' });
    if (limited) return limited;

    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = supabase as unknown as SupabaseQueryClient;
    const { data, error: fetchError } = await db
      .from('user_notification_preferences')
      .select('email, slack, sms')
      .eq('user_id', user.id)
      .limit(1);

    if (fetchError) {
      console.error('[Notification Prefs GET]', fetchError);
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    const prefs: NotificationPrefs = data?.[0] ?? DEFAULTS;
    return NextResponse.json(prefs);
  } catch (error) {
    console.error('[Notification Prefs GET] Unexpected:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/account/notifications
 * Upserts the authenticated user's notification preferences.
 * Accepts JSON body: { email?: boolean, slack?: boolean, sms?: boolean }
 */
export async function PUT(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'notif-prefs-put' });
    if (limited) return limited;

    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseBody(request, schemas.notificationPrefs);
    if (!parsed.success) return parsed.error;

    // Apply defaults for missing fields
    const email = parsed.data.email ?? DEFAULTS.email;
    const slack = parsed.data.slack ?? DEFAULTS.slack;
    const sms = parsed.data.sms ?? DEFAULTS.sms;

    const db = supabase as unknown as SupabaseQueryClient;
    const { data, error: upsertError } = await db
      .from('user_notification_preferences')
      .upsert(
        {
          user_id: user.id,
          email,
          slack,
          sms,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('email, slack, sms')
      .single();

    if (upsertError) {
      console.error('[Notification Prefs PUT]', upsertError);
      return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Notification Prefs PUT] Unexpected:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
