
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/activity — Activity Feed API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';

interface AuditLogRow {
  id: string;
  entity_id: string;
  actor_id: string;
  actor_type: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'activity' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { entityIds, db } = ctx;

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const entityId = searchParams.get('entityId');

    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20;
    const offset = offsetParam ? Math.max(parseInt(offsetParam, 10) || 0, 0) : 0;

    // Use specific entity or all accessible entities
    const targetEntityIds = entityId ? [entityId] : entityIds;

    if (targetEntityIds.length === 0) {
      return NextResponse.json({ activities: [], total: 0 });
    }

    // Verify entity access if specific entityId requested
    if (entityId && !entityIds.includes(entityId)) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Query audit_log table
    const { data, error } = await db
      .from('audit_log')
      .select('id, entity_id, actor_id, actor_type, action, target_type, target_id, details, created_at')
      .in('entity_id', targetEntityIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Activity] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch activity feed' },
        { status: 500 }
      );
    }

    // Map to activity feed format
    const activities = (data as unknown as AuditLogRow[] || []).map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      actorId: row.actor_id,
      actorType: row.actor_type,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      timestamp: row.created_at,
      description: formatActivityDescription(row),
    }));

    return NextResponse.json({
      activities,
      total: activities.length,
      offset,
      limit,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/activity', 'Failed to fetch activity feed');
  }
}

// ─── Activity Description Formatter ─────────────────────────────────────────────

function formatActivityDescription(row: AuditLogRow): string {
  const actor = row.actor_type === 'ai' ? 'AI' : row.actor_type === 'system' ? 'System' : 'User';
  const target = row.target_type.replace(/_/g, ' ');

  switch (row.action) {
    case 'create':
      return `${actor} created a ${target}`;
    case 'update':
      return `${actor} updated a ${target}`;
    case 'delete':
      return `${actor} deleted a ${target}`;
    case 'categorize':
      return `${actor} categorized a ${target}`;
    case 'approve':
      return `${actor} approved a ${target}`;
    case 'revoke':
      return `${actor} revoked a ${target}`;
    case 'export':
      return `${actor} exported ${target} data`;
    case 'sync':
      return `${actor} synced ${target}`;
    case 'login':
      return `${actor} logged in`;
    case 'connect':
      return `${actor} connected a ${target}`;
    case 'disconnect':
      return `${actor} disconnected a ${target}`;
    default:
      return `${actor} performed ${row.action} on ${target}`;
  }
}
