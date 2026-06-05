
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/audit — Audit Trail
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-helpers';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'audit' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db, entityIds: orgEntityIds } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const parsedLimit = parseInt(searchParams.get('limit') || '50', 10);
    const parsedOffset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Math.min(Math.max(1, isNaN(parsedLimit) ? 50 : parsedLimit), 200);
    const offset = Math.max(0, isNaN(parsedOffset) ? 0 : parsedOffset);

    // Resolve entity IDs to scope audit logs
    let entityIds: string[] = [];

    if (entityId) {
      const { data: entity } = await db
        .from('entities')
        .select('id, org_id')
        .eq('id', entityId)
        .eq('org_id', membership.org_id)
        .single();

      if (!entity) {
        return NextResponse.json(
          { error: 'Entity not found or access denied' },
          { status: 403 }
        );
      }
      entityIds = [entity.id];
    } else {
      entityIds = orgEntityIds;
      if (entityIds.length === 0) {
        return NextResponse.json({
          auditLogs: [],
          pagination: { total: 0, limit, offset, hasMore: false },
        });
      }
    }

    // Fetch audit logs
    const { data: auditLogs, error: auditError, count } = await db
      .from('audit_log')
      .select('*', { count: 'exact' })
      .in('entity_id', entityIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (auditError) {
      console.error('[Audit] Query error:', auditError);
      return NextResponse.json(
        { error: 'Failed to fetch audit logs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      auditLogs: auditLogs || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    return handleApiError(error, 'audit', 'Failed to fetch audit logs');
  }
}
