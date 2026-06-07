// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/webhooks/events — Webhook Event History
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { webhookEventDispatcher } from '@/lib/webhooks/events';

/**
 * GET — List recent webhook events for the authenticated org.
 * Query params:
 *   - limit: number (default 50, max 500)
 */
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'wh-events' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership } = ctx;

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    let limit = 50;

    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 500);
      }
    }

    const events = webhookEventDispatcher.getEventHistory(membership.org_id, limit);

    return NextResponse.json({
      events,
      count: events.length,
      limit,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/webhooks/events', 'Failed to fetch webhook events');
  }
}
