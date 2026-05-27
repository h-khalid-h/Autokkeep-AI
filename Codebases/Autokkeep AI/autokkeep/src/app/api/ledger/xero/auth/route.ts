import { NextRequest, NextResponse } from 'next/server';
import { getXeroAuthUrl, exchangeXeroCode, refreshXeroToken } from '@/lib/ledger/sync';

// GET /api/ledger/xero/auth — Start Xero OAuth flow
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
    const authUrl = getXeroAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate Xero auth URL' },
      { status: 500 }
    );
  }
}

// POST /api/ledger/xero/auth — Exchange code for tokens
export async function POST(request: NextRequest) {
  try {
    const { code, state } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

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

    const tokens = await exchangeXeroCode(code);

    const { error: dbError } = await (supabase as any).from('ledger_connections').upsert(
      {
        entity_id: entityId,
        provider: 'xero',
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
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

    await (supabase as any).from('audit_log').insert({
      entity_id: entityId,
      action: 'create',
      target_type: 'ledger_connection',
      actor_type: 'human',
      details: { provider: 'xero', tenant_id: tokens.tenantId },
    });

    return NextResponse.json({
      ok: true,
      provider: 'xero',
      tenantId: tokens.tenantId,
    });
  } catch (error) {
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

  const { data: conn } = await (supabase as any)
    .from('ledger_connections')
    .select('*')
    .eq('entity_id', entityId)
    .eq('provider', 'xero')
    .eq('is_active', true)
    .single();

  if (!conn) return null;

  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (expiresAt - Date.now() < 5 * 60 * 1000) {
    try {
      const refreshed = await refreshXeroToken(conn.refresh_token);
      await (supabase as any)
        .from('ledger_connections')
        .update({
          access_token: refreshed.accessToken,
          refresh_token: refreshed.refreshToken,
          token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        })
        .eq('id', conn.id);

      return { accessToken: refreshed.accessToken, tenantId: conn.tenant_id };
    } catch {
      await (supabase as any).from('ledger_connections').update({ is_active: false }).eq('id', conn.id);
      return null;
    }
  }

  return { accessToken: conn.access_token, tenantId: conn.tenant_id };
}
