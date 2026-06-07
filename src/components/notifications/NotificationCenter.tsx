'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import styles from './notification-center.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: 'transaction' | 'report' | 'alert' | 'team' | 'export' | 'system';
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  action_url?: string;
}

const TYPE_ICONS: Record<Notification['type'], string> = {
  transaction: '🔔',
  report: '📊',
  alert: '⚠️',
  team: '👥',
  export: '📦',
  system: '🔧',
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const POLL_INTERVAL = 60_000;

// ─── Component ──────────────────────────────────────────────────────────────────

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch notifications ───────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/notifications?limit=10');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error('[NotificationCenter] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Fetch unread count ────────────────────────────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/count');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch (err) {
      console.error('[NotificationCenter] Count error:', err);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate API data fetch
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Poll unread count
  useEffect(() => {
    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate API data fetch
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // ── Click outside ─────────────────────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // ── Escape key ────────────────────────────────────────────────────────────
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  // ── Mark as read ──────────────────────────────────────────────────────────
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notificationId, read: true }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('[NotificationCenter] Mark read error:', err);
    }
  }, []);

  // ── Mark all as read ──────────────────────────────────────────────────────
  const markAllAsRead = useCallback(async () => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('[NotificationCenter] Mark all read error:', err);
    }
  }, []);

  return (
    <div ref={containerRef} className={styles.bellWrapper}>
      {/* Bell Button */}
      <button
        id="notification-center-bell"
        className={styles.bellButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        🔔
        {unreadCount > 0 && (
          <span className={styles.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className={styles.dropdown} role="dialog" aria-label="Notifications">
          {/* Header */}
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button className={styles.markAllButton} onClick={markAllAsRead}>
                Mark all as read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className={styles.notificationList}>
            {isLoading && notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>⏳</div>
                <div className={styles.emptyText}>Loading...</div>
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>✨</div>
                <div className={styles.emptyText}>No notifications yet</div>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={notif.read ? styles.notificationItem : styles.notificationItemUnread}
                  onClick={() => {
                    if (!notif.read) markAsRead(notif.id);
                    if (notif.action_url) {
                      window.location.href = notif.action_url;
                      setIsOpen(false);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!notif.read) markAsRead(notif.id);
                    }
                  }}
                >
                  <span className={styles.notifIcon}>
                    {TYPE_ICONS[notif.type] || '🔔'}
                  </span>
                  <div className={styles.notifBody}>
                    <div className={styles.notifTitle}>{notif.title}</div>
                    <p className={styles.notifMessage}>{notif.message}</p>
                    <span className={styles.notifTime}>{timeAgo(notif.created_at)}</span>
                  </div>
                  {!notif.read && <span className={styles.notifUnreadDot} />}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className={styles.dropdownFooter}>
            <Link
              href="/notifications"
              className={styles.viewAllLink}
              onClick={() => setIsOpen(false)}
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
