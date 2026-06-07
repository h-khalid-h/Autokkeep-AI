
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/audit/export — Audit Trail CSV Export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';

const CSV_HEADERS = ['Date', 'User', 'Action', 'Entity Type', 'Entity ID', 'Details'];
const MAX_ROWS = 10_000;

/**
 * Escapes a CSV field value. Wraps in double quotes if it contains
 * commas, double quotes, or newlines.
 */
function escapeCsvField(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    // Tight rate limit — CSV export is expensive
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'audit-export' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db, entityIds: orgEntityIds } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // ── Resolve entity scope ──────────────────────────────────────────────────
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
        // Return header-only CSV for orgs with no entities
        const csv = CSV_HEADERS.join(',') + '\n';
        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="audit_log.csv"',
          },
        });
      }
    }

    // ── Build query ───────────────────────────────────────────────────────────
    let query = db
      .from('audit_log')
      .select('actor_id, action, target_type, entity_id, details, created_at')
      .in('entity_id', entityIds)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      // Use end of day for endDate inclusivity
      query = query.lte('created_at', `${endDate}T23:59:59.999Z`);
    }

    const { data: auditLogs, error: auditError } = await query;

    if (auditError) {
      console.error('[AuditExport] Query error:', auditError);
      return NextResponse.json(
        { error: 'Failed to export audit logs' },
        { status: 500 }
      );
    }

    // ── Build CSV ─────────────────────────────────────────────────────────────
    const rows: string[] = [CSV_HEADERS.join(',')];

    for (const log of auditLogs || []) {
      const record = log as Record<string, unknown>;
      const date = record.created_at ? new Date(record.created_at as string).toISOString() : '';
      const user = (record.actor_id as string) || '';
      const action = (record.action as string) || '';
      const entityType = (record.target_type as string) || '';
      const entId = (record.entity_id as string) || '';
      const details = record.details ? JSON.stringify(record.details) : '';

      rows.push(
        [date, user, action, entityType, entId, details]
          .map(escapeCsvField)
          .join(',')
      );
    }

    const csv = rows.join('\n') + '\n';

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="audit_log.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/audit/export', 'Failed to export audit logs');
  }
}
