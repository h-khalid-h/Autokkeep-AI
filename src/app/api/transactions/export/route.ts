import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'txn-export' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const format = searchParams.get('format') || 'csv';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const status = searchParams.get('status');

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId is required' },
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

    // Build query
    let query = db
      .from('transactions')
      .select('id, amount, currency, date, merchant_name, category_ai, category_human, status, document_status, tags, description, confidence, ai_reasoning, created_at')
      .eq('entity_id', entity.id)
      .neq('status', 'removed')
      .order('date', { ascending: false })
      .limit(10000); // Safety cap to prevent OOM

    if (status) {
      const statuses = status.split(',').map((s: string) => s.trim());
      query = statuses.length === 1
        ? query.eq('status', statuses[0])
        : query.in('status', statuses);
    }

    if (dateFrom) {
      query = query.gte('date', dateFrom);
    }

    if (dateTo) {
      query = query.lte('date', dateTo);
    }

    const { data: transactions, error: txError } = await query;

    if (txError) {
      console.error('[Export] Query error:', txError);
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    const rows = transactions || [];

    // JSON format
    if (format === 'json') {
      return NextResponse.json(rows);
    }

    // CSV format
    const csvHeader = 'Date,Merchant,Amount,Currency,Category (GL Code),Status,AI Confidence,AI Reasoning';
    const csvRows = rows.map((t: Record<string, unknown>) => {
      const escapeCsv = (val: unknown): string => {
        if (val === null || val === undefined) return '';
        let str = String(val);
        // Prevent CSV formula injection — prefix dangerous starting chars
        if (/^[=+\-@\t\r]/.test(str)) {
          str = "'" + str;
        }
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes("'")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escapeCsv(t.date),
        escapeCsv(t.merchant_name),
        escapeCsv(t.amount),
        escapeCsv(t.currency || 'USD'),
        escapeCsv(t.category_ai),
        escapeCsv(t.status),
        escapeCsv(t.confidence !== null && t.confidence !== undefined ? String(t.confidence) : ''),
        escapeCsv(t.ai_reasoning),
      ].join(',');
    });

    const csv = [csvHeader, ...csvRows].join('\n');
    const today = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=autokkeep-transactions-${today}.csv`,
      },
    });
  } catch (error) {
    console.error('[Export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export transactions' },
      { status: 500 }
    );
  }
}
