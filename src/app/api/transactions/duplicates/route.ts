// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/transactions/duplicates — Detect duplicate transactions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { detectDuplicates, type TransactionRecord } from '@/lib/transactions/duplicate-detector';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'dup-detect' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    // Verify entity access
    const { data: entity } = await db
      .from('entities')
      .select('id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Fetch last 90 days of transactions for duplicate detection
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const since = ninetyDaysAgo.toISOString().slice(0, 10);

    const { data: transactions, error: fetchErr } = await db
      .from('transactions')
      .select('id, merchant_name, amount, date, bank_account_id, plaid_transaction_id')
      .eq('entity_id', entityId)
      .gte('date', since)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(5000);

    if (fetchErr) {
      console.error('[Duplicate Detect] Query error:', fetchErr);
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    const records: TransactionRecord[] = (transactions || []).map((tx: Record<string, unknown>) => ({
      id: tx.id as string,
      merchant_name: tx.merchant_name as string | null,
      amount: Number(tx.amount),
      date: tx.date as string,
      bank_account_id: tx.bank_account_id as string | null,
      plaid_transaction_id: tx.plaid_transaction_id as string | null,
    }));

    const duplicates = detectDuplicates(records);

    return NextResponse.json({
      duplicates,
      scannedCount: records.length,
      duplicateGroupCount: duplicates.length,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/transactions/duplicates', 'Failed to detect duplicates');
  }
}
