
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/export — CSV Data Export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import {
  generateTransactionsCsv,
  generateChartOfAccountsCsv,
  generateAuditLogCsv,
} from '@/lib/export/csv-generator';
import type { ExportType } from '@/lib/export/csv-generator';

const VALID_TYPES: ExportType[] = ['transactions', 'chart-of-accounts', 'audit-log'];

/**
 * GET /api/export
 * Download a CSV file.
 *
 * Query params:
 *  - entityId (required)
 *  - type: 'transactions' | 'chart-of-accounts' | 'audit-log'
 *  - startDate, endDate, status (optional filters)
 *
 * Returns: CSV file with Content-Disposition header
 */
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'export' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db, entityIds } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const type = searchParams.get('type') as ExportType | null;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const status = searchParams.get('status') || undefined;

    // Validate entityId
    if (!entityId) {
      return NextResponse.json({ error: 'Missing "entityId" query parameter' }, { status: 400 });
    }

    // Verify entity belongs to user's org
    if (!entityIds.includes(entityId)) {
      return NextResponse.json({ error: 'Entity not found or access denied' }, { status: 403 });
    }

    // Validate type
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid "type" parameter. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const filters = { startDate, endDate, status };

    // Generate CSV based on type
    let csvContent: string;
    let filename: string;

    switch (type) {
      case 'transactions':
        csvContent = await generateTransactionsCsv(db, entityId, filters);
        filename = `transactions_${entityId}_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      case 'chart-of-accounts':
        csvContent = await generateChartOfAccountsCsv(db, entityId);
        filename = `chart_of_accounts_${entityId}_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      case 'audit-log':
        csvContent = await generateAuditLogCsv(db, entityId, filters);
        filename = `audit_log_${entityId}_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
    }

    // Log audit event for the export
    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'export',
      targetType: type,
      details: {
        filters,
        orgId: membership.org_id,
      },
      request,
    });

    // Return CSV response with download headers
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/export', 'Failed to generate export');
  }
}
