import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { exchangeSlackCode, getSlackInstallUrl } from '@/lib/channels/slack';
import { encryptToken } from '@/lib/crypto';

// GET /api/channels/slack/install — Redirect to Slack OAuth
export async function GET(request: NextRequest) {
  const entityId = request.nextUrl.searchParams.get('entityId');

  if (!entityId) {
    return NextResponse.json({ error: 'Missing entityId' }, { status: 400 });
  }

  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'slack-install' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    // Verify entity belongs to user's org
    const { data: entity } = await db.from('entities').select('org_id').eq('id', entityId).single();
    if (!entity || entity.org_id !== membership.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = getSlackInstallUrl();
    return NextResponse.redirect(url);
  } catch (_error: unknown) {
    return NextResponse.json(
      { error: 'Failed to generate Slack install URL' },
      { status: 500 }
    );
  }
}

// POST /api/channels/slack/install — Handle callback with code
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'slack-install' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const { code, entityId } = await request.json();

    if (!code || !entityId) {
      return NextResponse.json({ error: 'Missing code or entityId' }, { status: 400 });
    }

    // Verify entity belongs to user's org
    const { data: entity } = await db.from('entities').select('org_id').eq('id', entityId).single();
    if (!entity || entity.org_id !== membership.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await exchangeSlackCode(code);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (!result.accessToken) {
      return NextResponse.json({ error: 'Slack did not return an access token' }, { status: 400 });
    }

    const { error: dbError } = await db.from('channel_connections').insert({
      entity_id: entityId,
      channel_type: 'slack',
      channel_id: result.teamId,
      access_token: encryptToken(result.accessToken),
      workspace_name: result.teamName,
      is_active: true,
    });

    if (dbError) {
      console.error('[Slack Install] DB error:', dbError);
      return NextResponse.json({ error: 'Failed to save Slack connection' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      teamId: result.teamId,
      teamName: result.teamName,
    });
  } catch (_error: unknown) {
    return NextResponse.json(
      { error: 'Slack installation failed' },
      { status: 500 }
    );
  }
}
