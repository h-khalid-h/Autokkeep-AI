
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/currency/rates — FX Rates Endpoint
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { fxRateProvider } from '@/lib/currency/fx-rates';

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 60 req/min for FX rate lookups
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'fx-rates' });
    if (limited) return limited;

    // Auth check
    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const base = (searchParams.get('base') || 'USD').toUpperCase();
    const targetsParam = searchParams.get('targets');

    if (!targetsParam || !targetsParam.trim()) {
      return NextResponse.json(
        { error: 'Missing required query parameter: targets (comma-separated currency codes)' },
        { status: 400 }
      );
    }

    const targets = targetsParam
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    if (targets.length === 0) {
      return NextResponse.json(
        { error: 'At least one target currency is required' },
        { status: 400 }
      );
    }

    // Cap target count to prevent abuse
    if (targets.length > 50) {
      return NextResponse.json(
        { error: 'Too many target currencies (max 50)' },
        { status: 400 }
      );
    }

    const rates = await fxRateProvider.getRates(base, targets);

    return NextResponse.json({ rates });
  } catch (error) {
    return handleApiError(error, 'GET /api/currency/rates', 'Failed to fetch FX rates');
  }
}
