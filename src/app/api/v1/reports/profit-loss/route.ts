
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/v1/reports/profit-loss — Public API: Generate P&L Report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/public-api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/logger';
import { generateProfitAndLoss } from '@/lib/reports/profit-loss';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const log = createLogger('api-v1-profit-loss');

export async function GET(request: NextRequest) {
  try {
    // Rate limit
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'v1-pnl' });
    if (limited) return limited;

    // Authenticate via X-API-Key
    const ctx = await validateApiKey(request);
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const periodStart = searchParams.get('periodStart');
    const periodEnd = searchParams.get('periodEnd');

    // Validate required params
    if (!entityId) {
      return NextResponse.json({ error: 'Missing required parameter: entityId' }, { status: 400 });
    }
    if (!periodStart) {
      return NextResponse.json({ error: 'Missing required parameter: periodStart' }, { status: 400 });
    }
    if (!periodEnd) {
      return NextResponse.json({ error: 'Missing required parameter: periodEnd' }, { status: 400 });
    }

    log.info('Generating P&L report', { orgId: ctx.orgId, entityId, periodStart, periodEnd });

    const supabase = await createServerClient();

    // Verify entity belongs to this org
    const { data: entity, error: entityError } = await supabase
      .from('entities')
      .select('id')
      .eq('id', entityId)
      .eq('org_id', ctx.orgId)
      .single();

    if (entityError || !entity) {
      return NextResponse.json(
        { error: 'Entity not found or does not belong to your organization' },
        { status: 403 }
      );
    }

    // Generate the P&L report
    const db = supabase as unknown as SupabaseQueryClient;
    const report = await generateProfitAndLoss(db, entityId, periodStart, periodEnd);

    return NextResponse.json({ data: report });
  } catch (error) {
    return handleApiError(error, 'GET /api/v1/reports/profit-loss', 'Failed to generate P&L report');
  }
}
