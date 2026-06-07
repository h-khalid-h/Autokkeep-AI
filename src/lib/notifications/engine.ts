
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — In-App Notification Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Manages in-app notifications with CRUD operations against the Supabase
// `notifications` table. Supports pagination, read/unread filtering,
// batch mark-as-read, and soft-delete.

import { createLogger } from '@/lib/logger';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const log = createLogger('notifications');

// ─── Types ──────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'transaction_approved'
  | 'transaction_rejected'
  | 'transaction_flagged'
  | 'month_end_ready'
  | 'report_generated'
  | 'webhook_failed'
  | 'system_alert'
  | 'team_invite'
  | 'export_complete';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface GetNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

// ─── Row → Model Mapping ────────────────────────────────────────────────────────

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    metadata: row.metadata ?? undefined,
    read: row.read,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

// ─── Engine Functions ───────────────────────────────────────────────────────────

/**
 * Creates a new notification for a user.
 *
 * @param db - Supabase client
 * @param userId - Target user ID
 * @param type - Notification type
 * @param title - Short title
 * @param message - Notification body
 * @param metadata - Optional JSON metadata
 * @returns The created notification, or null on failure
 */
export async function createNotification(
  db: SupabaseQueryClient,
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<Notification | null> {
  try {
    const { data, error } = await db
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        metadata: metadata ?? null,
        read: false,
        read_at: null,
        deleted_at: null,
      })
      .select('*')
      .single();

    if (error) {
      log.error('Failed to create notification', { error: error.message, userId, type });
      return null;
    }

    log.info('Notification created', { userId, type, notificationId: data.id });
    return rowToNotification(data as NotificationRow);
  } catch (err) {
    log.error('Unexpected error creating notification', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Fetches notifications for a user with optional filtering and pagination.
 *
 * @param db - Supabase client
 * @param userId - Target user ID
 * @param opts - Filtering & pagination options
 * @returns Array of notifications
 */
export async function getNotifications(
  db: SupabaseQueryClient,
  userId: string,
  opts: GetNotificationsOptions = {}
): Promise<Notification[]> {
  const { unreadOnly = false, limit = 50, offset = 0 } = opts;

  let query = db
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) {
    query = query.eq('read', false);
  }

  const { data, error } = await query;

  if (error) {
    log.error('Failed to fetch notifications', { error: error.message, userId });
    return [];
  }

  return (data as NotificationRow[]).map(rowToNotification);
}

/**
 * Marks a single notification as read.
 *
 * @param db - Supabase client
 * @param notificationId - ID of the notification
 * @param userId - Owner user ID (prevents cross-user access)
 * @returns true if updated successfully
 */
export async function markAsRead(
  db: SupabaseQueryClient,
  notificationId: string,
  userId: string
): Promise<boolean> {
  const { error, count } = await db
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) {
    log.error('Failed to mark notification as read', { error: error.message, notificationId });
    return false;
  }

  return (count ?? 0) > 0 || !error;
}

/**
 * Marks all notifications as read for a user.
 *
 * @param db - Supabase client
 * @param userId - Target user ID
 * @returns Number of notifications updated
 */
export async function markAllAsRead(
  db: SupabaseQueryClient,
  userId: string
): Promise<number> {
  const { error, count } = await db
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('read', false)
    .is('deleted_at', null);

  if (error) {
    log.error('Failed to mark all notifications as read', { error: error.message, userId });
    return 0;
  }

  return count ?? 0;
}

/**
 * Returns the count of unread notifications for a user.
 *
 * @param db - Supabase client
 * @param userId - Target user ID
 * @returns Unread count
 */
export async function getUnreadCount(
  db: SupabaseQueryClient,
  userId: string
): Promise<number> {
  const { count, error } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
    .is('deleted_at', null);

  if (error) {
    log.error('Failed to get unread count', { error: error.message, userId });
    return 0;
  }

  return count ?? 0;
}

/**
 * Soft-deletes a notification by setting deleted_at.
 *
 * @param db - Supabase client
 * @param notificationId - ID of the notification
 * @param userId - Owner user ID (prevents cross-user access)
 * @returns true if deleted successfully
 */
export async function deleteNotification(
  db: SupabaseQueryClient,
  notificationId: string,
  userId: string
): Promise<boolean> {
  const { error } = await db
    .from('notifications')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) {
    log.error('Failed to delete notification', { error: error.message, notificationId });
    return false;
  }

  log.info('Notification soft-deleted', { notificationId, userId });
  return true;
}
