// GET /api/transactions/recurring — Detect recurring transaction patterns
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { rateLimit } from '@/lib/rate-limit';
import { detectRecurringPatterns } from '@/lib/recurring/detector';

/**
 * GET /api/transactions/recurring?entityId=<uuid>
 *
 * Returns detected recurring transaction patterns for the given entity.
 * Fetches the last 12 months of transactions and runs interval-based
 * pattern detection to identify subscriptions and recurring payments.
 */
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'recurring-detect' });
    if (limited) return limited;

    // ── Auth ─────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Validate entityId ────────────────────────────────────────────────
    const entityId = request.nextUrl.searchParams.get('entityId');
    if (!entityId) {
      return NextResponse.json(
        { error: 'Missing required query parameter: entityId' },
        { status: 400 }
      );
    }

    // ── Fetch transactions (last 12 months) ──────────────────────────────
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const sinceDate = twelveMonthsAgo.toISOString().split('T')[0];

    const db = supabase as unknown as SupabaseQueryClient;
    const { data: transactions, error: fetchError } = await db
      .from('transactions')
      .select('id, merchant_name, amount, date')
      .eq('entity_id', entityId)
      .gte('date', sinceDate)
      .not('merchant_name', 'is', null)
      .order('date', { ascending: true });

    if (fetchError) {
      console.error('[Recurring Detect] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    // ── Detect patterns ──────────────────────────────────────────────────
    const patterns = detectRecurringPatterns(transactions ?? []);

    return NextResponse.json({ patterns });
  } catch (error) {
    return handleApiError(error, 'transactions/recurring GET');
  }
}
