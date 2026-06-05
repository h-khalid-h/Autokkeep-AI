// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/stats — Platform-wide statistics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/admin';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Plan price mapping for revenue estimation */
const PLAN_PRICES: Record<string, number> = {
  free: 0,
  starter: 29,
  smb_growth: 99,
  cpa_professional: 299,
  cpa_enterprise: 499,
};

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 15, windowSeconds: 60, prefix: 'admin-stats' });
    if (limited) return limited;
    // ── Auth check ────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Use admin client for cross-org queries ────────────────────────────────
    const admin = createAdminClient() as unknown as SupabaseQueryClient;

    // ── Parallel queries ──────────────────────────────────────────────────────
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      orgsResult,
      entitiesResult,
      txTotalResult,
      txPendingResult,
      txApprovedResult,
      txAutoResult,
      txHumanReviewResult,
      txSyncedResult,
      txTodayResult,
      txWeekResult,
      txMonthResult,
      subsResult,
    ] = await Promise.all([
      admin.from('organizations').select('id', { count: 'exact', head: true }),
      admin.from('entities').select('id', { count: 'exact', head: true }),
      admin.from('transactions').select('id', { count: 'exact', head: true }),
      admin.from('transactions').select('id', { count: 'exact', head: true }).eq('status', TRANSACTION_STATUS.PENDING),
      admin.from('transactions').select('id', { count: 'exact', head: true }).eq('status', TRANSACTION_STATUS.APPROVED),
      admin.from('transactions').select('id', { count: 'exact', head: true }).eq('status', TRANSACTION_STATUS.AUTO_CATEGORIZED),
      admin.from('transactions').select('id', { count: 'exact', head: true }).eq('status', TRANSACTION_STATUS.HUMAN_REVIEW),
      admin.from('transactions').select('id', { count: 'exact', head: true }).eq('status', TRANSACTION_STATUS.SYNCED),
      admin.from('transactions').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      admin.from('transactions').select('id', { count: 'exact', head: true }).gte('created_at', weekStart),
      admin.from('transactions').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
      admin.from('subscriptions').select('plan, status').eq('status', 'active'),
    ]);

    // ── Compute subscription breakdown ────────────────────────────────────────
    const activeSubs: Record<string, number> = {};
    let monthlyRevenue = 0;

    if (subsResult.data) {
      for (const sub of subsResult.data as { plan: string; status: string }[]) {
        activeSubs[sub.plan] = (activeSubs[sub.plan] || 0) + 1;
        monthlyRevenue += PLAN_PRICES[sub.plan] || 0;
      }
    }

    return NextResponse.json({
      organizations: orgsResult.count || 0,
      entities: entitiesResult.count || 0,
      transactions: {
        total: txTotalResult.count || 0,
        byStatus: {
          pending: txPendingResult.count || 0,
          approved: txApprovedResult.count || 0,
          auto_categorized: txAutoResult.count || 0,
          human_review: txHumanReviewResult.count || 0,
          synced: txSyncedResult.count || 0,
        },
        today: txTodayResult.count || 0,
        thisWeek: txWeekResult.count || 0,
        thisMonth: txMonthResult.count || 0,
      },
      subscriptions: {
        byPlan: activeSubs,
        monthlyRevenue,
      },
    });
  } catch (error) {
    return handleApiError(error, 'admin-stats', 'Failed to fetch admin stats');
  }
}
