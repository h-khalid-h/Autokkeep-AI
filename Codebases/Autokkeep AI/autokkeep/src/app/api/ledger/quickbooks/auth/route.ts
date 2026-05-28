import { NextRequest, NextResponse } from 'next/server';
import { getQBOAuthUrl, exchangeQBOCode, refreshQBOToken } from '@/lib/ledger/sync';

// GET /api/ledger/quickbooks/auth — Start QBO OAuth flow
export async function GET(request: NextRequest) {
  const entityId = request.nextUrl.searchParams.get('entityId');

  if (!entityId) {
    return NextResponse.json({ error: 'Missing entityId' }, { status: 400 });
  }

  try {
    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Org membership check
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization membership' }, { status: 403 });
    }

    // Verify entity belongs to user's org
    const { data: entity } = await (supabase as any).from('entities').select('org_id').eq('id', entityId).single();
    if (!entity || entity.org_id !== membership.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const state = Buffer.from(JSON.stringify({ entityId })).toString('base64');
    const authUrl = getQBOAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate QuickBooks auth URL' },
      { status: 500 }
    );
  }
}

// POST /api/ledger/quickbooks/auth — Exchange code for tokens (callback handler)
export async function POST(request: NextRequest) {
  try {
    const { code, realmId, state } = await request.json();

    if (!code || !realmId) {
      return NextResponse.json({ error: 'Missing code or realmId' }, { status: 400 });
    }

    // Decode state to get entityId
    let entityId = '';
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        entityId = decoded.entityId;
      } catch {
        return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
      }
    }

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Org membership check
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization membership' }, { status: 403 });
    }

    // Verify entity belongs to user's org
    if (entityId) {
      const { data: entity } = await (supabase as any).from('entities').select('org_id').eq('id', entityId).single();
      if (!entity || entity.org_id !== membership.org_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Exchange code for tokens
    const tokens = await exchangeQBOCode(code, realmId);

    // Upsert ledger connection
    const { error: dbError } = await (supabase as any).from('ledger_connections').upsert(
      {
        entity_id: entityId,
        provider: 'quickbooks',
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        realm_id: realmId,
        is_active: true,
        token_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
        last_synced_at: new Date().toISOString(),
      },
      {
        onConflict: 'entity_id,provider',
      }
    );

    if (dbError) {
      console.error('[QBO Auth] DB error:', dbError);
      return NextResponse.json({ error: 'Failed to save QuickBooks connection' }, { status: 500 });
    }

    // Log to audit trail
    const { writeAuditLog } = await import('@/lib/audit');
    await writeAuditLog({
      supabase,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'create',
      targetType: 'ledger_connection',
      details: { provider: 'quickbooks', realm_id: realmId },
      request,
    });

    return NextResponse.json({
      ok: true,
      provider: 'quickbooks',
      realmId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'QuickBooks authentication failed' },
      { status: 500 }
    );
  }
}

// Helper: Get fresh QBO access token (auto-refresh if expired)
export async function getQBOAccessToken(entityId: string): Promise<{
  accessToken: string;
  realmId: string;
} | null> {
  const { createServerClient } = await import('@/lib/supabase/server');
  const supabase = await createServerClient();

  const { data: conn } = await (supabase as any)
    .from('ledger_connections')
    .select('*')
    .eq('entity_id', entityId)
    .eq('provider', 'quickbooks')
    .eq('is_active', true)
    .single();

  if (!conn) return null;

  // Check if token is expired
  const expiresAt = new Date(conn.token_expires_at).getTime();
  const now = Date.now();

  if (expiresAt - now < 5 * 60 * 1000) {
    // Refresh if within 5 minutes of expiry
    try {
      const refreshed = await refreshQBOToken(conn.refresh_token);

      await (supabase as any)
        .from('ledger_connections')
        .update({
          access_token: refreshed.accessToken,
          refresh_token: refreshed.refreshToken,
          token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        })
        .eq('id', conn.id);

      return {
        accessToken: refreshed.accessToken,
        realmId: conn.realm_id,
      };
    } catch {
      // Token refresh failed — mark connection as inactive
      await (supabase as any)
        .from('ledger_connections')
        .update({ is_active: false })
        .eq('id', conn.id);
      return null;
    }
  }

  return {
    accessToken: conn.access_token,
    realmId: conn.realm_id,
  };
}
