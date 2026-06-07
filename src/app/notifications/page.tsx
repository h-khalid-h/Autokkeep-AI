'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Button, EmptyState, Skeleton, useToast } from '@/components/ui';
import type { Notification } from '@/components/notifications/NotificationCenter';
import styles from './notifications.module.css';

// ─── Constants ──────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'unread' | 'transaction' | 'report' | 'alert' | 'team' | 'system';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'transaction', label: 'Transactions' },
  { key: 'report', label: 'Reports' },
  { key: 'alert', label: 'Alerts' },
  { key: 'team', label: 'Team' },
  { key: 'system', label: 'System' },
];

const TYPE_ICONS: Record<string, string> = {
  transaction: '🔔',
  report: '📊',
  alert: '⚠️',
  team: '👥',
  export: '📦',
  system: '🔧',
};

const PAGE_SIZE = 20;

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
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const toast = useToast();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async (reset = false) => {
    try {
      setIsLoading(true);
      const newOffset = reset ? 0 : offset;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(newOffset),
      });

      const res = await fetch(`/api/notifications?${params}`);
      if (!res.ok) throw new Error('Failed to load');

      const data = await res.json();
      const items: Notification[] = data.notifications || [];

      if (reset) {
        setNotifications(items);
        setOffset(items.length);
      } else {
        setNotifications((prev) => [...prev, ...items]);
        setOffset((prev) => prev + items.length);
      }
      setHasMore(items.length >= PAGE_SIZE);
    } catch (err) {
      console.error('[NotificationsPage] Error:', err);
      toast.error('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, [offset, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate API data fetch
    fetchNotifications(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    if (activeTab === 'all') return notifications;
    if (activeTab === 'unread') return notifications.filter((n) => !n.read);
    return notifications.filter((n) => n.type === activeTab);
  }, [notifications, activeTab]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((n) => n.id)));
    }
  };

  // ── Mark as read ──────────────────────────────────────────────────────────
  const markAsRead = useCallback(async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, read: true }),
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (err) {
      console.error('[NotificationsPage] Mark read error:', err);
    }
  }, []);

  const markSelectedAsRead = useCallback(async () => {
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, read: true }),
          })
        )
      );
      setNotifications((prev) =>
        prev.map((n) => (selectedIds.has(n.id) ? { ...n, read: true } : n))
      );
      setSelectedIds(new Set());
      toast.success(`Marked ${ids.length} as read`);
    } catch (_err) {
      toast.error('Failed to mark as read');
    }
  }, [selectedIds, toast]);

  const markAllAsRead = useCallback(async () => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success('All notifications marked as read');
    } catch (_err) {
      toast.error('Failed to mark all as read');
    }
  }, [toast]);

  return (
    <ErrorBoundary componentName="Notifications">
      <AppShell>
        <div className={styles.page}>
          <h1 className="sr-only">Notifications</h1>

          {/* Header */}
          <div>
            <div className={styles.pageHeader}>
              <span className={styles.pageTitle}>🔔 Notifications</span>
            </div>
            <p className={styles.pageDescription}>
              Stay on top of everything happening across your organization.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className={styles.filterTabs}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={activeTab === tab.key ? styles.filterTabActive : styles.filterTab}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                {tab.key === 'unread' && unreadCount > 0 && (
                  <span className={styles.tabBadge}>{unreadCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* Toolbar */}
          <Card>
            <div className={styles.toolbar}>
              <div className={styles.toolbarLeft}>
                <input
                  type="checkbox"
                  className={styles.notifCheckbox}
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                />
                {selectedIds.size > 0 && (
                  <>
                    <span className={styles.selectCount}>{selectedIds.size} selected</span>
                    <Button variant="ghost" size="sm" onClick={markSelectedAsRead}>
                      ✓ Mark read
                    </Button>
                  </>
                )}
              </div>
              <div className={styles.toolbarRight}>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                    Mark all as read
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => fetchNotifications(true)}>
                  🔄 Refresh
                </Button>
              </div>
            </div>

            {/* Notification List */}
            <div className={styles.notificationList}>
              {isLoading && notifications.length === 0 ? (
                <div style={{ padding: 'var(--space-4)' }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} width="100%" height={72} />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className={styles.emptyContainer}>
                  <EmptyState
                    icon="✨"
                    title={activeTab === 'unread' ? 'All caught up!' : 'No notifications'}
                    description={
                      activeTab === 'unread'
                        ? "You've read all your notifications."
                        : 'No notifications match this filter.'
                    }
                  />
                </div>
              ) : (
                filtered.map((notif) => (
                  <div
                    key={notif.id}
                    className={notif.read ? styles.notificationItem : styles.notificationItemUnread}
                    onClick={() => {
                      if (!notif.read) markAsRead(notif.id);
                    }}
                  >
                    <input
                      type="checkbox"
                      className={styles.notifCheckbox}
                      checked={selectedIds.has(notif.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(notif.id); }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className={styles.notifIcon}>
                      {TYPE_ICONS[notif.type] || '🔔'}
                    </span>
                    <div className={styles.notifBody}>
                      <div className={styles.notifHeader}>
                        <span className={styles.notifTitle}>{notif.title}</span>
                        <span className={styles.notifTime}>{timeAgo(notif.created_at)}</span>
                      </div>
                      <p className={styles.notifMessage}>{notif.message}</p>
                      {notif.action_url && (
                        <div className={styles.notifActions}>
                          <a
                            href={notif.action_url}
                            className={styles.notifActionLink}
                            onClick={(e) => e.stopPropagation()}
                          >
                            View details →
                          </a>
                        </div>
                      )}
                    </div>
                    {!notif.read && <span className={styles.notifUnreadDot} />}
                  </div>
                ))
              )}
            </div>

            {/* Load More */}
            {hasMore && filtered.length > 0 && (
              <div className={styles.loadMore}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchNotifications(false)}
                  disabled={isLoading}
                >
                  {isLoading ? 'Loading...' : 'Load more'}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </AppShell>
    </ErrorBoundary>
  );
}
