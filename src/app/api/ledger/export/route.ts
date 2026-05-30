
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/ledger/export — Export Journal Entries as CSV or SQL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { exportToCSV, exportToSQL } from '@/lib/ledger/csv-export';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'ledger-export' });
    if (limited) return limited;

    const supabase = await createServerClient();

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Validate org membership
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Validate entity access
    const { data: entity } = await (supabase as any)
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
      const sqlDump = await exportToSQL(supabase, entityId, exportOptions);
      return new NextResponse(sqlDump, {
        status: 200,
        headers: {
          'Content-Type': 'application/sql',
          'Content-Disposition': `attachment; filename=autokkeep-journal-entries-${today}.sql`,
        },
      });
    }

    // Default: CSV
    const csv = await exportToCSV(supabase, entityId, exportOptions);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=autokkeep-journal-entries-${today}.csv`,
      },
    });
  } catch (error) {
    console.error('[Ledger Export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export journal entries' },
      { status: 500 }
    );
  }
}
