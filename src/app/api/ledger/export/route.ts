
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/ledger/export — Export Journal Entries as CSV or SQL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-helpers';
import { getApiAuthContext } from '@/lib/api-auth';
import { exportToCSV, exportToSQL } from '@/lib/ledger/csv-export';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'ledger-export' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db, user } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const format = searchParams.get('format') || 'csv';
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const status = searchParams.get('status') || undefined;

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId is required' },
        { status: 400 }
      );
    }

    if (format !== 'csv' && format !== 'sql') {
      return NextResponse.json(
        { error: 'format must be "csv" or "sql"' },
        { status: 400 }
      );
    }

    // Validate entity access
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

    const exportOptions = { startDate, endDate, status };
    const today = new Date().toISOString().slice(0, 10);

    if (format === 'sql') {
      const sqlDump = await exportToSQL(db, entityId, exportOptions);
      writeAuditLog({
        supabase: db,
        entityId,
        actorId: user.id,
        actorType: 'human',
        action: 'export',
        targetType: 'ledger_data',
        details: { entityId, format: 'sql', count: sqlDump.split('\n').length },
        request,
      });
      return new NextResponse(sqlDump, {
        status: 200,
        headers: {
          'Content-Type': 'application/sql',
          'Content-Disposition': `attachment; filename=autokkeep-journal-entries-${today}.sql`,
        },
      });
    }

    // Default: CSV
    const csv = await exportToCSV(db, entityId, exportOptions);
    writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'export',
      targetType: 'ledger_data',
      details: { entityId, format: 'csv', count: csv.split('\n').length },
      request,
    });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=autokkeep-journal-entries-${today}.csv`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'ledger-export', 'Failed to export journal entries');
  }
}
