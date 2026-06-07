
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/analytics/category — Category Drill-down
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'cat-drill' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const category = searchParams.get('category');
    const periodStart = searchParams.get('periodStart');
    const periodEnd = searchParams.get('periodEnd');

    // ── Validation ────────────────────────────────────────────────────────────
    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId is required' },
        { status: 400 }
      );
    }

    if (!category) {
      return NextResponse.json(
        { error: 'category is required' },
        { status: 400 }
      );
    }

    // ── Entity Access Check ───────────────────────────────────────────────────
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

    // ── Look up category name from chart_of_accounts ──────────────────────────
    const { data: coaEntry } = await db
      .from('chart_of_accounts')
      .select('name')
      .eq('entity_id', entityId)
      .eq('code', category)
      .limit(1);

    const categoryName = coaEntry?.[0]?.name || category;

    // ── Fetch matching transactions ───────────────────────────────────────────
    // Match where category_human OR category_ai equals the given category
    let query = db
      .from('transactions')
      .select('id, date, merchant_name, amount, status')
      .eq('entity_id', entityId)
      .neq('status', TRANSACTION_STATUS.REMOVED)
      .is('deleted_at', null)
      .or(`category_human.eq.${category},category_ai.eq.${category}`);

    if (periodStart) {
      query = query.gte('date', periodStart);
    }
    if (periodEnd) {
      query = query.lte('date', periodEnd);
    }

    query = query.order('date', { ascending: false });

    const { data: transactions, error: txError } = await query;

    if (txError) {
      console.error('[CategoryDrilldown] Transaction query error:', txError);
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    const txns = transactions || [];

    // ── Aggregate totals ──────────────────────────────────────────────────────
    const totalAmount = txns.reduce(
      (sum: number, t: Record<string, unknown>) => sum + Math.abs(Number(t.amount) || 0),
      0
    );

    // ── Vendor breakdown ──────────────────────────────────────────────────────
    const vendorMap: Record<string, { count: number; total: number }> = {};
    for (const t of txns) {
      const vendor = (t as Record<string, unknown>).merchant_name as string || 'Unknown';
      if (!vendorMap[vendor]) {
        vendorMap[vendor] = { count: 0, total: 0 };
      }
      vendorMap[vendor].count++;
      vendorMap[vendor].total += Math.abs(Number((t as Record<string, unknown>).amount) || 0);
    }

    const vendorBreakdown = Object.entries(vendorMap)
      .map(([vendor, data]) => ({
        vendor,
        count: data.count,
        total: Math.round(data.total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    // ── Monthly trend ─────────────────────────────────────────────────────────
    const monthMap: Record<string, number> = {};
    for (const t of txns) {
      const dateStr = (t as Record<string, unknown>).date as string;
      if (!dateStr) continue;
      const month = dateStr.slice(0, 7); // YYYY-MM
      monthMap[month] = (monthMap[month] || 0) + Math.abs(Number((t as Record<string, unknown>).amount) || 0);
    }

    const monthlyTrend = Object.entries(monthMap)
      .map(([month, total]) => ({
        month,
        total: Math.round(total * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json({
      category,
      categoryName,
      totalAmount: Math.round(totalAmount * 100) / 100,
      transactionCount: txns.length,
      transactions: txns,
      vendorBreakdown,
      monthlyTrend,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/analytics/category', 'Failed to fetch category drill-down');
  }
}
