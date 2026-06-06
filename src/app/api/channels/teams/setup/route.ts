import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';

/**
 * POST /api/channels/teams/setup — Save Microsoft Teams webhook URL
 *
 * Called from Settings → Integrations → Teams → "Configure Teams" button.
 * Stores the incoming webhook URL in channel_connections so the dispatch
 * engine can send Adaptive Cards to the workspace.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'teams-setup' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    const body = await request.json();
    const { entityId, webhookUrl } = body as { entityId?: string; webhookUrl?: string };

    if (!entityId || typeof entityId !== 'string') {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
    }
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return NextResponse.json({ error: 'webhookUrl is required' }, { status: 400 });
    }

    // Verify entity access
    if (!entityIds.includes(entityId)) {
      return NextResponse.json({ error: 'Access denied to this entity' }, { status: 403 });
    }

    // Validate URL format — must be a valid Microsoft Teams webhook URL
    try {
      const url = new URL(webhookUrl);
      if (url.protocol !== 'https:') {
        return NextResponse.json(
          { error: 'Webhook URL must use HTTPS' },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid webhook URL format' },
        { status: 400 },
      );
    }

    // Upsert channel_connection — one Teams connection per entity
    const { error: upsertError } = await db
      .from('channel_connections')
      .upsert(
        {
          entity_id: entityId,
          channel_type: 'teams',
          webhook_url: webhookUrl,
          is_active: true,
          connected_by: user.id,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'entity_id,channel_type',
        },
      );

    if (upsertError) {
      console.error('[Teams Setup] Upsert error:', upsertError);
      return NextResponse.json(
        { error: 'Failed to save Teams configuration' },
        { status: 500 },
      );
    }

    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'update',
      targetType: 'integration',
      targetId: 'teams',
      details: { action: 'teams_setup', webhookConfigured: true },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'POST /api/channels/teams/setup', 'Failed to configure Teams');
  }
}
