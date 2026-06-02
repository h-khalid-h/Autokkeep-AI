'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient as getSupabase } from '@/lib/supabase/client';
import styles from './NotificationBell.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Notification {
  id: string;
  type: 'transaction' | 'sync' | 'receipt' | 'review' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

const NOTIFICATION_ICONS: Record<Notification['type'], string> = {
  transaction: '💳',
  sync: '🔄',
  receipt: '🧾',
  review: '⚠️',
  system: '🔔',
};

// ─── Helpers ────────────────────────────────────────────────────────────────
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
  return `${diffDay}d ago`;
}

// ─── Initial notifications (seeded until real data flows) ───────────────────
function getInitialNotifications(): Notification[] {
  const now = Date.now();
  return [
    {
      id: 'n1',
      type: 'transaction',
      title: 'New transaction imported',
      message: '12 transactions from Chase Business ••4821',
      timestamp: new Date(now - 15 * 60000).toISOString(),
      read: false,
    },
    {
      id: 'n2',
      type: 'transaction',
      title: 'Transaction auto-categorized',
      message: 'AWS $1,247.00 → Cloud Infrastructure (6210)',
      timestamp: new Date(now - 45 * 60000).toISOString(),
      read: false,
    },
    {
      id: 'n3',
      type: 'review',
      title: 'Transaction flagged for review',
      message: 'Unusual $3,500 charge from unknown vendor',
      timestamp: new Date(now - 2 * 3600000).toISOString(),
      read: false,
    },
    {
      id: 'n4',
      type: 'sync',
      title: 'Bank sync completed',
      message: 'Chase Business account synced successfully',
      timestamp: new Date(now - 5 * 3600000).toISOString(),
      read: true,
    },
    {
      id: 'n5',
      type: 'receipt',
      title: 'Receipt captured',
      message: 'Receipt matched to Uber $34.50 on May 24',
      timestamp: new Date(now - 8 * 3600000).toISOString(),
      read: true,
    },
  ];
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const bellRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Load initial notifications
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotifications(() => getInitialNotifications());
  }, []);

  // ─── Supabase Realtime subscription ─────────────────────────────────────
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof getSupabase>['channel']> | null = null;

    try {
      const supabase = getSupabase();
      channel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'transactions',
          },
          (payload) => {
            const newNotif: Notification = {
              id: `rt-${Date.now()}`,
              type: 'transaction',
              title: 'New transaction',
              message: `${payload.new?.merchant || 'Unknown'} — ${payload.new?.amount || ''}`,
              timestamp: new Date().toISOString(),
              read: false,
            };
            setNotifications((prev) => [newNotif, ...prev].slice(0, 20));
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'health_alerts',
          },
          (payload) => {
            const newNotif: Notification = {
              id: `rt-health-${Date.now()}`,
              type: 'review',
              title: 'Health alert',
              message: payload.new?.message || 'New health alert',
              timestamp: new Date().toISOString(),
              read: false,
            };
            setNotifications((prev) => [newNotif, ...prev].slice(0, 20));
          }
        )
        .subscribe();
    } catch {
      // Supabase not configured or realtime not available — silent fallback
    }

    return () => {
      if (channel) {
        const supabase = getSupabase();
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const toggleDropdown = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedIndex(() => 0);
    } else {
      setFocusedIndex(() => -1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const visibleNotifications = notifications.slice(0, 5);
    const hasMarkAllButton = notifications.length > 0 && notifications.some(n => !n.read);
    const totalItems = visibleNotifications.length + (hasMarkAllButton ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
          itemRefs.current[focusedIndex]?.click();
        }
        break;
    }
  }, [notifications, focusedIndex]);

  return (
    <div ref={bellRef} className={styles.bellWrapper}>
      <button
        onClick={toggleDropdown}
        className={styles.bellButton}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        🔔
        {unreadCount > 0 && (
          <span className={styles.unreadBadge}>{unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div
          className={styles.dropdown}
          role="menu"
          onKeyDown={handleKeyDown}
        >
          {/* Header */}
          <div className={styles.header}>
            <span className={styles.headerTitle}>Notifications</span>
            {unreadCount > 0 && (
              <span className={styles.newBadge}>{unreadCount} new</span>
            )}
          </div>

          {/* Notification List */}
          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>✨</span>
                All caught up! No new notifications.
              </div>
            ) : (
              notifications.slice(0, 5).map((notif, index) => (
                <div
                  key={notif.id}
                  role="menuitem"
                  tabIndex={-1}
                  ref={(el) => { itemRefs.current[index] = el; }}
                  className={[
                    styles.notifItem,
                    !notif.read ? styles.notifItemUnread : '',
                    focusedIndex === index ? styles.notifItemFocused : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className={styles.notifIcon}>
                    {NOTIFICATION_ICONS[notif.type]}
                  </span>
                  <div className={styles.notifContent}>
                    <div className={styles.notifTitleRow}>
                      <span className={`${styles.notifTitle} ${!notif.read ? styles.notifTitleUnread : ''}`}>
                        {notif.title}
                      </span>
                      {!notif.read && <span className={styles.unreadDot} />}
                    </div>
                    <p className={styles.notifMessage}>{notif.message}</p>
                    <span className={styles.notifTime}>{timeAgo(notif.timestamp)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && unreadCount > 0 && (
            <div className={styles.footer}>
              <button
                onClick={markAllAsRead}
                className={styles.markAllBtn}
                role="menuitem"
                tabIndex={-1}
                ref={(el) => { itemRefs.current[notifications.slice(0, 5).length] = el as HTMLDivElement | null; }}
              >
                Mark all as read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
