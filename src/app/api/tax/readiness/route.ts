
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/tax/readiness — Tax Readiness Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { analyzeTaxReadiness } from '@/lib/tax/readiness';

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 10 requests per minute
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'tax-readiness' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const yearStr = searchParams.get('taxYear');

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    const taxYear = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

    if (isNaN(taxYear) || taxYear < 2000 || taxYear > 2100) {
      return NextResponse.json(
        { error: 'taxYear must be between 2000 and 2100' },
        { status: 400 }
      );
    }

    // Validate entity access against org
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

    // Run tax readiness analysis
    const report = await analyzeTaxReadiness(entityId, taxYear, db);

    return NextResponse.json({ report });
  } catch (error) {
    console.error('[Tax/Readiness] Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze tax readiness' },
      { status: 500 }
    );
  }
}
