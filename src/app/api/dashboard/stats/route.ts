
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dashboard/stats — Dashboard Statistics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'dash-stats' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db, entityIds: allEntityIds } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');

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
        return NextResponse.json({
          totalTransactions: 0,
          pendingReview: 0,
          autoApproved: 0,
          synced: 0,
          aiAccuracy: 0,
          monthlyVolume: 0,
          topCategories: [],
          recentActivity: [],
        });
      }
    }

    // Run count queries in parallel
    // Uses head:true to avoid fetching rows — only counts are returned
    const [totalRes, pendingRes, autoRes, syncedRes, highConfRes, catRes] = await Promise.all([
      // Total transactions
      db.from('transactions').select('id', { count: 'exact', head: true })
        .in('entity_id', entityIds).neq('status', 'removed').is('deleted_at', null),
      // Pending review
      db.from('transactions').select('id', { count: 'exact', head: true })
        .in('entity_id', entityIds).in('status', ['pending', 'human_review']).is('deleted_at', null),
      // Auto approved
      db.from('transactions').select('id', { count: 'exact', head: true })
        .in('entity_id', entityIds).in('status', ['auto_categorized', 'approved']).is('deleted_at', null),
      // Synced
      db.from('transactions').select('id', { count: 'exact', head: true })
        .in('entity_id', entityIds).eq('status', 'synced').is('deleted_at', null),
      // High confidence (>= 90)
      db.from('transactions').select('id', { count: 'exact', head: true })
        .in('entity_id', entityIds).gte('confidence', 90).is('deleted_at', null),
      // All categorized (has confidence)
      db.from('transactions').select('id', { count: 'exact', head: true })
        .in('entity_id', entityIds).not('confidence', 'is', null).is('deleted_at', null),
    ]);

    const totalTransactions = totalRes.count ?? 0;
    const pendingReview = pendingRes.count ?? 0;
    const autoApproved = autoRes.count ?? 0;
    const synced = syncedRes.count ?? 0;
    const highConfidence = highConfRes.count ?? 0;
    const categorizedCount = catRes.count ?? 0;
    const aiAccuracy = categorizedCount > 0
      ? Math.round((highConfidence / categorizedCount) * 1000) / 10
      : 0;

    // Monthly volume: fetch only current month's amounts
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const { data: monthTxns } = await db
      .from('transactions')
      .select('amount, base_amount')
      .in('entity_id', entityIds)
      .neq('status', 'removed')
      .is('deleted_at', null)
      .gte('date', monthStart)
      .limit(50000); // F9: safety cap to prevent unbounded row fetch

    const monthlyVolume = (monthTxns || [])
      .reduce((sum: number, t: Record<string, unknown>) => {
        const val = Number(t.base_amount ?? t.amount) || 0; // F5: prefer base_amount for multi-currency
        return sum + Math.abs(val);
      }, 0);

    // Top categories: use server-side aggregation to avoid row limits
    // Fetch all categories with their counts using a targeted query
    // We use a two-pass approach: first get distinct categories, then count each
    const { data: catTxns } = await db
      .from('transactions')
      .select('category_ai, amount, base_amount')
      .in('entity_id', entityIds)
      .neq('status', 'removed')
      .is('deleted_at', null)
      .not('category_ai', 'is', null)
      .order('category_ai', { ascending: true })
      .limit(10000); // F8: safety cap to prevent unbounded row fetch

    const categoryMap: Record<string, { count: number; amount: number }> = {};
    for (const t of (catTxns || [])) {
      const code = t.category_ai;
      if (!code) continue;
      if (!categoryMap[code]) {
        categoryMap[code] = { count: 0, amount: 0 };
      }
      categoryMap[code].count++;
      const catVal = Number((t as Record<string, unknown>).base_amount ?? t.amount) || 0; // F5: prefer base_amount
      categoryMap[code].amount += Math.abs(catVal);
    }

    const topCategories = Object.entries(categoryMap)
      .map(([code, data]) => ({
        code,
        count: data.count,
        amount: Math.round(data.amount * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Recent activity: last 10 transactions with server-side ordering
    const { data: recentTxns } = await db
      .from('transactions')
      .select('status, merchant_name, amount, updated_at, date')
      .in('entity_id', entityIds)
      .in('status', ['approved', 'auto_categorized'])
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(10);

    const recentActivity = (recentTxns || []).map((t: Record<string, unknown>) => ({
      action: t.status === 'auto_categorized' ? 'auto_approved' : 'approved',
      merchant: t.merchant_name,
      amount: t.amount,
      timestamp: t.updated_at || t.date,
    }));

    return NextResponse.json({
      totalTransactions,
      pendingReview,
      autoApproved,
      synced,
      aiAccuracy,
      monthlyVolume: Math.round(monthlyVolume * 100) / 100,
      topCategories,
      recentActivity,
    });
  } catch (error) {
    console.error('[Dashboard Stats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    );
  }
}
