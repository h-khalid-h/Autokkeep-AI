// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/portfolio/consolidated — Consolidated Portfolio View
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { buildConsolidatedPortfolio } from '@/lib/portfolio/consolidator';

/**
 * GET — Returns a consolidated portfolio view across all org entities.
 * Query params:
 *   - displayCurrency: string (default "USD")
 *   - asOfDate: string (default today, format YYYY-MM-DD)
 */
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'portfolio' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const { searchParams } = new URL(request.url);
    const displayCurrency = (searchParams.get('displayCurrency') || 'USD').toUpperCase();
    const asOfDate = searchParams.get('asOfDate') || new Date().toISOString().slice(0, 10);

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(asOfDate)) {
      return NextResponse.json(
        { error: 'Invalid asOfDate format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    const portfolio = await buildConsolidatedPortfolio(
      membership.org_id,
      displayCurrency,
      asOfDate,
      { db }
    );

    return NextResponse.json(portfolio);
  } catch (error) {
    return handleApiError(error, 'GET /api/portfolio/consolidated', 'Failed to build consolidated portfolio');
  }
}
