
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/v1/transactions — Public API: List Transactions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/public-api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-v1-transactions');

export async function GET(request: NextRequest) {
  try {
    // Rate limit
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'v1-txns' });
    if (limited) return limited;

    // Authenticate via X-API-Key
    const ctx = await validateApiKey(request);
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    log.info('Listing transactions', { orgId: ctx.orgId, entityId, status, limit, offset });

    const supabase = await createServerClient();

    // Get entity IDs for this org
    const { data: orgEntities } = await supabase
      .from('entities')
      .select('id')
      .eq('org_id', ctx.orgId);

    const entityIds = (orgEntities || []).map((e: { id: string }) => e.id);

    if (entityIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, limit, offset });
    }

    // Build query
    let query = supabase
      .from('transactions')
      .select('id, entity_id, merchant_name, amount, date, status, category_ai, confidence, created_at, updated_at', { count: 'exact' })
      .in('entity_id', entityId ? [entityId] : entityIds)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data: transactions, count, error } = await query;

    if (error) {
      log.error('Failed to fetch transactions', { error: error.message, orgId: ctx.orgId });
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }

    return NextResponse.json({
      data: transactions || [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/v1/transactions', 'Failed to fetch transactions');
  }
}
