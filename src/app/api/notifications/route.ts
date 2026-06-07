
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST/DELETE /api/notifications — Notification CRUD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '@/lib/notifications/engine';

/**
 * GET /api/notifications
 * List notifications for the authenticated user.
 * Query params: limit, offset, unreadOnly
 */
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'notif-list' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db } = ctx;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    const notifications = await getNotifications(db, user.id, { limit, offset, unreadOnly });

    return NextResponse.json({ notifications });
  } catch (error) {
    return handleApiError(error, 'GET /api/notifications', 'Failed to fetch notifications');
  }
}

/**
 * POST /api/notifications
 * Mark notification(s) as read.
 * Body: { notificationId: string } or { markAll: true }
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'notif-mark' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db } = ctx;

    const body = await request.json();

    if (body.markAll === true) {
      const count = await markAllAsRead(db, user.id);
      return NextResponse.json({ success: true, updated: count });
    }

    if (body.notificationId && typeof body.notificationId === 'string') {
      const success = await markAsRead(db, body.notificationId, user.id);
      return NextResponse.json({ success });
    }

    return NextResponse.json(
      { error: 'Request body must include "notificationId" or "markAll: true"' },
      { status: 400 }
    );
  } catch (error) {
    return handleApiError(error, 'POST /api/notifications', 'Failed to update notifications');
  }
}

/**
 * DELETE /api/notifications
 * Soft-delete a notification.
 * Query param: id
 */
export async function DELETE(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'notif-del' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db } = ctx;

    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get('id');

    if (!notificationId) {
      return NextResponse.json(
        { error: 'Missing "id" query parameter' },
        { status: 400 }
      );
    }

    const success = await deleteNotification(db, notificationId, user.id);
    return NextResponse.json({ success });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/notifications', 'Failed to delete notification');
  }
}
