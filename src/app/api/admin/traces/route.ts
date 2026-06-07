
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/traces — Recent Trace Spans
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { getRecentSpans } from '@/lib/telemetry/tracer';

export async function GET(request: NextRequest) {
  try {
    // Rate limit this endpoint itself
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'admin-traces' });
    if (limited) return limited;

    // Auth required
    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;

    // Parse limit from query params (default 50, max 200)
    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get('limit');
    const limit = rawLimit ? Math.min(Math.max(1, parseInt(rawLimit, 10) || 50), 200) : 50;

    const spans = getRecentSpans(limit);

    return NextResponse.json({ spans, count: spans.length });
  } catch (error) {
    return handleApiError(error, 'GET /api/admin/traces', 'Failed to fetch trace spans');
  }
}
