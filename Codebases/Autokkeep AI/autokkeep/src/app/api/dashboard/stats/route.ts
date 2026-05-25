
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dashboard/stats — Dashboard Statistics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
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

    // Validate org membership
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Resolve entity IDs
    let entityIds: string[] = [];

    if (entityId) {
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
      entityIds = [entity.id];
    } else {
      const { data: orgEntities } = await (supabase as any)
        .from('entities')
        .select('id')
        .eq('org_id', membership.org_id);

      entityIds = (orgEntities || []).map((e: { id: string }) => e.id);
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

    // Fetch all active transactions for these entities
    const { data: allTransactions, error: txError } = await (supabase as any)
      .from('transactions')
      .select('id, status, confidence, amount, category_ai, merchant_name, date, updated_at')
      .in('entity_id', entityIds)
      .neq('status', 'removed')
      .neq('status', 'deleted');

    if (txError) {
      console.error('[Dashboard Stats] Query error:', txError);
      return NextResponse.json(
        { error: 'Failed to fetch statistics' },
        { status: 500 }
      );
    }

    const transactions = allTransactions || [];

    // Compute counts
    const totalTransactions = transactions.length;
    const pendingReview = transactions.filter(
      (t: Record<string, any>) => t.status === 'human_review' || t.status === 'pending'
    ).length;
    const autoApproved = transactions.filter(
      (t: Record<string, any>) => t.status === 'auto_categorized' || t.status === 'approved'
    ).length;
    const synced = transactions.filter(
      (t: Record<string, any>) => t.status === 'synced'
    ).length;

    // AI accuracy: percentage of categorized transactions with confidence >= 90
    const categorized = transactions.filter(
      (t: Record<string, any>) => t.confidence !== null && t.confidence !== undefined
    );
    const highConfidence = categorized.filter(
      (t: Record<string, any>) => t.confidence >= 90
    );
    const aiAccuracy =
      categorized.length > 0
        ? Math.round((highConfidence.length / categorized.length) * 1000) / 10
        : 0;

    // Monthly volume: sum of amounts for the current month
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthlyVolume = transactions
      .filter((t: Record<string, any>) => t.date >= monthStart)
      .reduce((sum: number, t: Record<string, any>) => sum + Math.abs(t.amount || 0), 0);

    // Top categories: group by category_ai, count and sum
    const categoryMap: Record<string, { count: number; amount: number }> = {};
    for (const t of transactions) {
      const code = (t as Record<string, any>).category_ai;
      if (!code) continue;
      if (!categoryMap[code]) {
        categoryMap[code] = { count: 0, amount: 0 };
      }
      categoryMap[code].count++;
      categoryMap[code].amount += Math.abs((t as Record<string, any>).amount || 0);
    }

    const topCategories = Object.entries(categoryMap)
      .map(([code, data]) => ({
        code,
        count: data.count,
        amount: Math.round(data.amount * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Recent activity: last 10 transactions that were approved or auto-categorized
    const recentActivity = transactions
      .filter(
        (t: Record<string, any>) =>
          t.status === 'approved' ||
          t.status === 'auto_categorized'
      )
      .sort((a: Record<string, any>, b: Record<string, any>) =>
        (b.updated_at || b.date).localeCompare(a.updated_at || a.date)
      )
      .slice(0, 10)
      .map((t: Record<string, any>) => ({
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
