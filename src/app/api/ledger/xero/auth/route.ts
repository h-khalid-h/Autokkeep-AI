import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { getXeroAuthUrl, exchangeXeroCode, refreshXeroToken } from '@/lib/ledger/sync';
import { encryptToken, decryptToken } from '@/lib/crypto';
import { createHmac, timingSafeEqual } from 'crypto';
import { rateLimit } from '@/lib/rate-limit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const ALLOWED_RETURN_PATHS = ['/dashboard', '/onboarding', '/settings'];

// GET /api/ledger/xero/auth — Start Xero OAuth flow
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'xero-auth' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    // Now validate input
    const entityId = request.nextUrl.searchParams.get('entityId');

    if (!entityId) {
      return NextResponse.json({ error: 'Missing entityId' }, { status: 400 });
    }

    // Verify entity belongs to user's org
    const { data: entity } = await db.from('entities').select('org_id').eq('id', entityId).single();
    if (!entity || entity.org_id !== membership.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const returnToParam = request.nextUrl.searchParams.get('returnTo');
    const returnTo = returnToParam && ALLOWED_RETURN_PATHS.includes(returnToParam) ? returnToParam : '';
    const statePayload = Buffer.from(JSON.stringify({ entityId, ts: Date.now(), returnTo })).toString('base64');
    const hmacSecret = process.env.OAUTH_STATE_SECRET || process.env.CRON_SECRET;
    if (!hmacSecret) {
      console.error('[Xero Auth] OAUTH_STATE_SECRET / CRON_SECRET not set — cannot sign OAuth state');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    const hmac = createHmac('sha256', hmacSecret)
      .update(statePayload)
      .digest('hex');
    const state = `${statePayload}.${hmac}`;
    const authUrl = getXeroAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (_error: unknown) {
    return NextResponse.json(
      { error: 'Failed to generate Xero auth URL' },
      { status: 500 }
    );
  }
}

// POST /api/ledger/xero/auth — Exchange code for tokens
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'xero-exchange' });
    if (limited) return limited;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { code, state } = body;

    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    let entityId = '';
    let returnTo = '';
    if (state) {
      const [statePayload, signature] = state.split('.');
      if (!statePayload || !signature) {
        return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
      }
      const hmacSecret = process.env.OAUTH_STATE_SECRET || process.env.CRON_SECRET;
      if (!hmacSecret) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }
      const expectedHmac = createHmac('sha256', hmacSecret)
        .update(statePayload)
        .digest('hex');
      try {
        if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
          return NextResponse.json({ error: 'Invalid state signature' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid state signature' }, { status: 400 });
      }
      try {
        const decoded = JSON.parse(Buffer.from(statePayload, 'base64').toString());
        entityId = decoded.entityId;
        const rawReturnTo = decoded.returnTo || '';
        returnTo = rawReturnTo && ALLOWED_RETURN_PATHS.includes(rawReturnTo) ? rawReturnTo : '';
        // Check timestamp freshness (10 min window)
        if (decoded.ts && Date.now() - decoded.ts > 10 * 60 * 1000) {
          return NextResponse.json({ error: 'State parameter expired' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
      }
    }

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    // Verify entity belongs to user's org
    if (entityId) {
      const { data: entity } = await db.from('entities').select('org_id').eq('id', entityId).single();
      if (!entity || entity.org_id !== membership.org_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const tokens = await exchangeXeroCode(code);

    const { error: dbError } = await db.from('ledger_connections').upsert(
      {
        entity_id: entityId,
        provider: 'xero',
        access_token: encryptToken(tokens.accessToken),
        refresh_token: encryptToken(tokens.refreshToken),
        tenant_id: tokens.tenantId,
        is_active: true,
        token_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
        last_synced_at: new Date().toISOString(),
      },
      {
        onConflict: 'entity_id,provider',
      }
    );

    if (dbError) {
      console.error('[Xero Auth] DB error:', dbError);
      return NextResponse.json({ error: 'Failed to save Xero connection' }, { status: 500 });
    }

    const { writeAuditLog } = await import('@/lib/audit');
    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'create',
      targetType: 'ledger_connection',
      details: { provider: 'xero', tenant_id: tokens.tenantId },
      request,
    });

    return NextResponse.json({
      ok: true,
      provider: 'xero',
      tenantId: tokens.tenantId,
      ...(returnTo ? { returnTo } : {}),
    });
  } catch (_error: unknown) {
    return NextResponse.json(
      { error: 'Xero authentication failed' },
      { status: 500 }
    );
  }
}

// Helper: Get fresh Xero access token
export async function getXeroAccessToken(entityId: string): Promise<{
  accessToken: string;
  tenantId: string;
} | null> {
  const { createServerClient } = await import('@/lib/supabase/server');
  const supabase = await createServerClient();
  const db = supabase as unknown as SupabaseQueryClient;

  const { data: conn } = await db
    .from('ledger_connections')
    .select('id, entity_id, access_token, refresh_token, tenant_id, token_expires_at, is_active')
    .eq('entity_id', entityId)
    .eq('provider', 'xero')
    .eq('is_active', true)
    .single();

  if (!conn) return null;

  // Decrypt tokens from DB
  conn.access_token = decryptToken(conn.access_token);
  conn.refresh_token = decryptToken(conn.refresh_token);

  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (expiresAt - Date.now() < 5 * 60 * 1000) {
    try {
      const refreshed = await refreshXeroToken(conn.refresh_token);
      await db
        .from('ledger_connections')
        .update({
          access_token: encryptToken(refreshed.accessToken),
          refresh_token: encryptToken(refreshed.refreshToken),
          token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        })
        .eq('id', conn.id);

      return { accessToken: refreshed.accessToken, tenantId: conn.tenant_id };
    } catch {
      await db.from('ledger_connections').update({ is_active: false }).eq('id', conn.id);
      return null;
    }
  }

  return { accessToken: conn.access_token, tenantId: conn.tenant_id };
}
