import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { getSystemHealth } from '@/lib/database/health';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/health/detailed — Detailed system health endpoint (admin only).
 *
 * Returns a comprehensive SystemHealthReport including database connectivity,
 * Redis status, memory usage, and uptime. Requires authenticated user with
 * owner or admin role.
 */
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'health-detail' });
    if (limited) return limited;

    // Require authenticated admin/owner
    const ctx = await getApiAuthContext(request, {
      requireRole: ['owner', 'admin'],
    });
    if (ctx.error) return ctx.error;

    const report = await getSystemHealth();

    const httpStatus = report.status === 'unhealthy' ? 503
      : report.status === 'degraded' ? 200
      : 200;

    return NextResponse.json(report, { status: httpStatus });
  } catch (error) {
    return handleApiError(error, 'GET /api/health/detailed', 'Health check failed unexpectedly');
  }
}
