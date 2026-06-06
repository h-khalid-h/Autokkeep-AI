// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dashboard/trends — 6-month spending trend data for charts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'dash-trends' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db, entityIds: allEntityIds } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const months = Math.min(12, Math.max(1, parseInt(searchParams.get('months') || '6', 10)));

    // Resolve entity IDs
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
      entityIds = allEntityIds;
      if (entityIds.length === 0) {
        return NextResponse.json({ monthlyTrends: [], categoryBreakdown: [] });
      }
    }

    // Calculate date range: N months back from current month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const startDateStr = startDate.toISOString().slice(0, 10);

    // Fetch all transactions in the date range
    const { data: transactions, error: fetchErr } = await db
      .from('transactions')
      .select('amount, date, category_ai, category_human')
      .in('entity_id', entityIds)
      .neq('status', 'removed')
      .is('deleted_at', null)
      .gte('date', startDateStr)
      .order('date', { ascending: true })
      .limit(50000);

    if (fetchErr) {
      console.error('[Dashboard Trends] Query error:', fetchErr);
      return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
    }

    // Aggregate by month
    const monthlyMap = new Map<string, { income: number; expenses: number; transactions: number }>();

    // Pre-populate months
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, { income: 0, expenses: 0, transactions: 0 });
    }

    // Aggregate category totals
    const categoryTotals = new Map<string, number>();

    for (const tx of (transactions || [])) {
      const amount = Number(tx.amount) || 0;
      const date = tx.date as string;
      const monthKey = date.slice(0, 7); // YYYY-MM

      const bucket = monthlyMap.get(monthKey);
      if (bucket) {
        if (amount < 0) {
          // Negative amounts = income (credit)
          bucket.income += Math.abs(amount);
        } else {
          // Positive amounts = expenses (debit)
          bucket.expenses += amount;
        }
        bucket.transactions++;
      }

      // Category breakdown (use human category if available, else AI)
      const category = (tx.category_human as string) || (tx.category_ai as string);
      if (category && amount > 0) {
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
      }
    }

    // Build monthly trends array
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTrends = Array.from(monthlyMap.entries()).map(([key, data]) => {
      const [year, month] = key.split('-');
      return {
        month: `${monthNames[parseInt(month, 10) - 1]} ${year.slice(2)}`,
        monthKey: key,
        income: Math.round(data.income * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        net: Math.round((data.income - data.expenses) * 100) / 100,
        transactions: data.transactions,
      };
    });

    // Build category breakdown (top 8 + Other)
    const sortedCategories = Array.from(categoryTotals.entries())
      .map(([code, amount]) => ({ code, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);

    const topCategories = sortedCategories.slice(0, 8);
    const otherAmount = sortedCategories.slice(8).reduce((sum, c) => sum + c.amount, 0);

    const categoryBreakdown = [
      ...topCategories,
      ...(otherAmount > 0 ? [{ code: 'OTHER', amount: Math.round(otherAmount * 100) / 100 }] : []),
    ];

    return NextResponse.json({
      monthlyTrends,
      categoryBreakdown,
      period: {
        start: startDateStr,
        end: now.toISOString().slice(0, 10),
        months,
      },
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/dashboard/trends', 'Failed to fetch trend data');
  }
}
