// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/waterfall — Cash flow waterfall data by category
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'waterfall' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const periodStart = searchParams.get('periodStart');
    const periodEnd = searchParams.get('periodEnd');

    if (!entityId) {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
    }

    // Verify entity access
    const { data: entity } = await db
      .from('entities')
      .select('id, org_id, name')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found or access denied' }, { status: 403 });
    }

    // Default: current month
    const now = new Date();
    const start = periodStart || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const end = periodEnd || now.toISOString().slice(0, 10);

    // Fetch transactions in the period
    const { data: transactions, error: fetchErr } = await db
      .from('transactions')
      .select('amount, category_human, category_ai, merchant_name')
      .eq('entity_id', entityId)
      .neq('status', 'removed')
      .is('deleted_at', null)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .limit(50000);

    if (fetchErr) {
      console.error('[Waterfall] Query error:', fetchErr);
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }

    // Aggregate by category
    const inflowCategories = new Map<string, number>(); // revenue categories
    const outflowCategories = new Map<string, number>(); // expense categories

    for (const tx of (transactions || [])) {
      const amount = Number(tx.amount) || 0;
      const category = (tx.category_human as string) || (tx.category_ai as string) || 'Uncategorized';

      if (amount < 0) {
        // Revenue / inflow
        inflowCategories.set(category, (inflowCategories.get(category) || 0) + Math.abs(amount));
      } else if (amount > 0) {
        // Expense / outflow
        outflowCategories.set(category, (outflowCategories.get(category) || 0) + amount);
      }
    }

    // Build waterfall items
    interface WaterfallItem {
      label: string;
      amount: number;
      type: 'inflow' | 'outflow' | 'total';
    }

    const items: WaterfallItem[] = [];

    // Sort inflows by amount descending, take top 5 + other
    const sortedInflows = Array.from(inflowCategories.entries())
      .map(([code, amount]) => ({ code, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);

    const topInflows = sortedInflows.slice(0, 5);
    const otherInflow = sortedInflows.slice(5).reduce((sum, c) => sum + c.amount, 0);

    for (const inflow of topInflows) {
      items.push({ label: inflow.code, amount: inflow.amount, type: 'inflow' });
    }
    if (otherInflow > 0) {
      items.push({ label: 'Other Income', amount: Math.round(otherInflow * 100) / 100, type: 'inflow' });
    }

    // Sort outflows by amount descending, take top 5 + other
    const sortedOutflows = Array.from(outflowCategories.entries())
      .map(([code, amount]) => ({ code, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);

    const topOutflows = sortedOutflows.slice(0, 5);
    const otherOutflow = sortedOutflows.slice(5).reduce((sum, c) => sum + c.amount, 0);

    for (const outflow of topOutflows) {
      items.push({ label: outflow.code, amount: -outflow.amount, type: 'outflow' });
    }
    if (otherOutflow > 0) {
      items.push({ label: 'Other Expenses', amount: -Math.round(otherOutflow * 100) / 100, type: 'outflow' });
    }

    // Final total
    const totalInflow = sortedInflows.reduce((sum, c) => sum + c.amount, 0);
    const totalOutflow = sortedOutflows.reduce((sum, c) => sum + c.amount, 0);

    items.push({
      label: 'Net Cash Flow',
      amount: Math.round((totalInflow - totalOutflow) * 100) / 100,
      type: 'total',
    });

    return NextResponse.json({
      items,
      period: { start, end },
      summary: {
        totalInflow: Math.round(totalInflow * 100) / 100,
        totalOutflow: Math.round(totalOutflow * 100) / 100,
        netCashFlow: Math.round((totalInflow - totalOutflow) * 100) / 100,
      },
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/analytics/waterfall', 'Failed to fetch waterfall data');
  }
}
