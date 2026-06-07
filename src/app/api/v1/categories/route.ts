
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/v1/categories — Public API: List Categories (Chart of Accounts)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/public-api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-v1-categories');

export async function GET(request: NextRequest) {
  try {
    // Rate limit
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'v1-cat' });
    if (limited) return limited;

    // Authenticate via X-API-Key
    const ctx = await validateApiKey(request);
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');

    log.info('Listing categories', { orgId: ctx.orgId, entityId });

    const supabase = await createServerClient();

    // Get entity IDs for this org
    const { data: orgEntities } = await supabase
      .from('entities')
      .select('id')
      .eq('org_id', ctx.orgId);

    const entityIds = (orgEntities || []).map((e: { id: string }) => e.id);

    if (entityIds.length === 0) {
      return NextResponse.json({ data: [], total: 0 });
    }

    // Build query for chart_of_accounts
    const { data: categories, error } = await supabase
      .from('chart_of_accounts')
      .select('id, entity_id, code, name, type, is_active')
      .in('entity_id', entityId ? [entityId] : entityIds)
      .eq('is_active', true)
      .order('code', { ascending: true });

    if (error) {
      log.error('Failed to fetch categories', { error: error.message, orgId: ctx.orgId });
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    return NextResponse.json({
      data: categories || [],
      total: (categories || []).length,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/v1/categories', 'Failed to fetch categories');
  }
}
