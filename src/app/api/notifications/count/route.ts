
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/notifications/count — Unread Notification Count
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { getUnreadCount } from '@/lib/notifications/engine';

/**
 * GET /api/notifications/count
 * Returns the unread notification count for the authenticated user.
 * Response: { count: number }
 */
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 120, windowSeconds: 60, prefix: 'notif-count' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db } = ctx;

    const count = await getUnreadCount(db, user.id);

    return NextResponse.json({ count });
  } catch (error) {
    return handleApiError(error, 'GET /api/notifications/count', 'Failed to fetch unread count');
  }
}
