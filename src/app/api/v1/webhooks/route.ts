
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /api/v1/webhooks — Public API: Manage Webhook Subscriptions
// GET  — List webhook subscriptions
// POST — Create a new webhook subscription
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, hashApiKey } from '@/lib/api/public-api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-v1-webhooks');

// ── GET — List webhook subscriptions ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // Rate limit
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'v1-wh' });
    if (limited) return limited;

    // Authenticate via X-API-Key
    const ctx = await validateApiKey(request);
    if (ctx instanceof NextResponse) return ctx;

    log.info('Listing webhook subscriptions', { orgId: ctx.orgId });

    const supabase = await createServerClient();

    const { data: subscriptions, error } = await supabase
      .from('webhook_subscriptions')
      .select('id, url, events, is_active, created_at')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false });

    if (error) {
      log.error('Failed to fetch webhook subscriptions', { error: error.message, orgId: ctx.orgId });
      return NextResponse.json({ error: 'Failed to fetch webhook subscriptions' }, { status: 500 });
    }

    return NextResponse.json({
      data: subscriptions || [],
      total: (subscriptions || []).length,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/v1/webhooks', 'Failed to fetch webhook subscriptions');
  }
}

// ── POST — Create webhook subscription ────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Rate limit
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'v1-wh' });
    if (limited) return limited;

    // Authenticate via X-API-Key
    const ctx = await validateApiKey(request);
    if (ctx instanceof NextResponse) return ctx;

    // Parse and validate body
    let body: { url?: string; events?: string[]; secret?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { url, events, secret } = body;

    // Validate url
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing required field: url' }, { status: 400 });
    }
    if (!url.startsWith('https://')) {
      return NextResponse.json(
        { error: 'Webhook URL must use HTTPS' },
        { status: 400 }
      );
    }

    // Validate events
    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: events (must be a non-empty array)' },
        { status: 400 }
      );
    }

    // Validate secret
    if (!secret || typeof secret !== 'string') {
      return NextResponse.json({ error: 'Missing required field: secret' }, { status: 400 });
    }
    if (secret.length < 16) {
      return NextResponse.json(
        { error: 'Secret must be at least 16 characters long' },
        { status: 400 }
      );
    }

    log.info('Creating webhook subscription', { orgId: ctx.orgId, url, events });

    const supabase = await createServerClient();
    const secretHash = await hashApiKey(secret);

    // Use untyped query client for tables not in generated types
    const db = supabase as unknown as SupabaseQueryClient;

    const { data: subscription, error } = await db
      .from('webhook_subscriptions')
      .insert({
        org_id: ctx.orgId,
        url,
        events,
        secret_hash: secretHash,
        is_active: true,
        created_at: new Date().toISOString(),
      })
      .select('id, url, events, is_active, created_at')
      .single();

    if (error) {
      log.error('Failed to create webhook subscription', { error: error.message, orgId: ctx.orgId });
      return NextResponse.json({ error: 'Failed to create webhook subscription' }, { status: 500 });
    }

    return NextResponse.json(
      { data: subscription, message: 'Webhook subscription created' },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, 'POST /api/v1/webhooks', 'Failed to create webhook subscription');
  }
}
