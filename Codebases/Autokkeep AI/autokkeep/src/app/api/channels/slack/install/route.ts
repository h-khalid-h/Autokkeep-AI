import { NextRequest, NextResponse } from 'next/server';
import { exchangeSlackCode, getSlackInstallUrl } from '@/lib/channels/slack';

// GET /api/channels/slack/install — Redirect to Slack OAuth
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

    const url = getSlackInstallUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate Slack install URL' },
      { status: 500 }
    );
  }
}

// POST /api/channels/slack/install — Handle callback with code
export async function POST(request: NextRequest) {
  try {
    const { code, entityId } = await request.json();

    if (!code || !entityId) {
      return NextResponse.json({ error: 'Missing code or entityId' }, { status: 400 });
    }

    const result = await exchangeSlackCode(code);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Store channel connection in Supabase
    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    const { error: dbError } = await (supabase as any).from('channel_connections').insert({
      entity_id: entityId,
      channel_type: 'slack',
      channel_id: result.teamId,
      access_token: result.accessToken,
      workspace_name: result.teamName,
      is_active: true,
    });

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      teamId: result.teamId,
      teamName: result.teamName,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Slack install failed' },
      { status: 500 }
    );
  }
}
