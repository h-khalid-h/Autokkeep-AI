
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/rate-limits — Rate Limit Statistics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { rateLimitStats } from '@/lib/telemetry/rate-limit-stats';

export async function GET(request: NextRequest) {
  try {
    // Rate limit this endpoint itself
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'admin-rl' });
    if (limited) return limited;

    // Auth required
    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;

    const stats = rateLimitStats.getStats();

    return NextResponse.json({ stats });
  } catch (error) {
    return handleApiError(error, 'GET /api/admin/rate-limits', 'Failed to fetch rate limit stats');
  }
}
