// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/tax/export — Export approved transactions as CSV for accountant
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';
import { captureException } from '@/lib/sentry';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';

interface TransactionRow {
  date: string;
  merchant_name: string | null;
  amount: number;
  category_human: string | null;
  category_ai: string | null;
  gl_name: string | null;
  document_status: string;
}

function escapeCSV(value: string): string {
  let str = value;
  // Prevent CSV formula injection — prefix dangerous starting chars
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes("'")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 5 exports per minute
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'tax-export' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const yearStr = searchParams.get('year');

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'year must be between 2000 and 2100' },
        { status: 400 }
      );
    }

    // Validate entity access against org
    const { data: entity } = await db
      .from('entities')
      .select('id, org_id, name')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Query approved/synced transactions for the year
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const { data: transactions, error: txError } = await db
      .from('transactions')
      .select('date, merchant_name, amount, category_human, category_ai, gl_name, document_status')
      .eq('entity_id', entityId)
      .in('status', [TRANSACTION_STATUS.APPROVED, TRANSACTION_STATUS.SYNCED])
      .gte('date', startDate)
      .lte('date', endDate)
      .is('deleted_at', null)
      .order('date', { ascending: true });

    if (txError) {
      console.error('[Tax/Export] Query error:', txError);
      return NextResponse.json(
        { error: 'Failed to query transactions' },
        { status: 500 }
      );
    }

    const rows = (transactions || []) as TransactionRow[];

    // Build CSV header
    const csvLines: string[] = [];
    csvLines.push('Date,Merchant,Amount,Category (GL Code),GL Name,Deductible,Receipt');

    // Track category totals for summary
    const categoryTotals: Record<string, { amount: number; count: number; glName: string }> = {};

    for (const tx of rows) {
      const glCode = tx.category_human || tx.category_ai || '';
      const glName = tx.gl_name || '';
      const hasReceipt = tx.document_status === 'found' ? 'Yes' : 'No';
      // Transactions with an assigned GL code are considered deductible
      const isDeductible = glCode ? 'Yes' : 'No';

      csvLines.push([
        escapeCSV(tx.date),
        escapeCSV(tx.merchant_name || 'Unknown'),
        tx.amount.toFixed(2),
        escapeCSV(glCode),
        escapeCSV(glName),
        isDeductible,
        hasReceipt,
      ].join(','));

      // Accumulate category totals
      if (glCode) {
        if (!categoryTotals[glCode]) {
          categoryTotals[glCode] = { amount: 0, count: 0, glName };
        }
        categoryTotals[glCode].amount += tx.amount;
        categoryTotals[glCode].count += 1;
      }
    }

    // Add summary section
    csvLines.push('');
    csvLines.push('--- SUMMARY BY CATEGORY ---');
    csvLines.push('Category (GL Code),GL Name,Total Amount,Transaction Count');

    const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1].amount - a[1].amount);
    let grandTotal = 0;
    let totalCount = 0;

    for (const [code, data] of sortedCategories) {
      csvLines.push([
        escapeCSV(code),
        escapeCSV(data.glName),
        data.amount.toFixed(2),
        String(data.count),
      ].join(','));
      grandTotal += data.amount;
      totalCount += data.count;
    }

    csvLines.push([
      'TOTAL',
      '',
      grandTotal.toFixed(2),
      String(totalCount),
    ].join(','));

    const csv = csvLines.join('\n');

    // Write audit log (fire-and-forget)
    writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'export',
      targetType: 'tax_export',
      details: { year, transactionCount: rows.length, format: 'csv' },
      request,
    });

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="autokkeep-tax-export-${year}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[Tax/Export] Error:', error);
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to export tax data' },
      { status: 500 }
    );
  }
}
