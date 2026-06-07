
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/v1/reports/balance-sheet — Public API: Generate Balance Sheet Report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/public-api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/logger';
import { generateBalanceSheet } from '@/lib/reports/balance-sheet';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const log = createLogger('api-v1-balance-sheet');

export async function GET(request: NextRequest) {
  try {
    // Rate limit
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'v1-bs' });
    if (limited) return limited;

    // Authenticate via X-API-Key
    const ctx = await validateApiKey(request);
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const asOfDate = searchParams.get('asOfDate');

    // Validate required params
    if (!entityId) {
      return NextResponse.json({ error: 'Missing required parameter: entityId' }, { status: 400 });
    }
    if (!asOfDate) {
      return NextResponse.json({ error: 'Missing required parameter: asOfDate' }, { status: 400 });
    }

    log.info('Generating Balance Sheet', { orgId: ctx.orgId, entityId, asOfDate });

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

    // Generate the Balance Sheet report
    const db = supabase as unknown as SupabaseQueryClient;
    const report = await generateBalanceSheet(db, entityId, asOfDate);

    return NextResponse.json({ data: report });
  } catch (error) {
    return handleApiError(error, 'GET /api/v1/reports/balance-sheet', 'Failed to generate Balance Sheet');
  }
}
