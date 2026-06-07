'use client';

import { useEffect } from 'react';
import { useDataFetcher } from '@/hooks/useDataFetcher';
import Link from 'next/link';
import { Card, Skeleton } from '@/components/ui';
import styles from './activity-widget.module.css';

// ── Types ────────────────────────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  action: string;
  targetType: string;
  targetId?: string;
  actorType: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

interface ActivityWidgetProps {
  maxItems?: number;
  refreshInterval?: number; // in ms, default 60000
}

// ── Activity Icons ───────────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, string> = {
  create: '➕',
  update: '✏️',
  delete: '🗑️',
  approve: '✅',
  categorize: '🏷️',
  export: '📤',
  sync: '🔄',
  login: '🔑',
  connect: '🔗',
  revoke: '⛔',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  approve: 'Approved',
  categorize: 'Categorized',
  export: 'Exported',
  sync: 'Synced',
  login: 'Logged in',
  connect: 'Connected',
  revoke: 'Revoked',
};

// ── Component ────────────────────────────────────────────────────────────────────

export default function ActivityWidget({
  maxItems = 5,
  refreshInterval = 60000,
}: ActivityWidgetProps) {
  const { data: activityData, isLoading, refetch } = useDataFetcher(
    { activities: [] as ActivityItem[], teamStats: { activeMembers: 0, pendingInvites: 0 }, lastRefresh: null as Date | null },
    async (signal) => {
      const [activityRes, teamRes] = await Promise.all([
        fetch(`/api/activity?limit=${maxItems}`, { signal }).catch(() => null),
        fetch('/api/team', { signal }).catch(() => null),
      ]);
      let activities: ActivityItem[] = [];
      let teamStats = { activeMembers: 0, pendingInvites: 0 };
      if (activityRes?.ok) {
        const data = await activityRes.json();
        activities = data.activities || data.entries || [];
      }
      if (teamRes?.ok) {
        const data = await teamRes.json();
        const stats = data.stats;
        if (stats) {
          teamStats = { activeMembers: stats.active || 0, pendingInvites: stats.invited || 0 };
        }
      }
      return { activities, teamStats, lastRefresh: new Date() };
    },
    { deps: [maxItems] }
  );
  const activities = activityData.activities;
  const teamStats = activityData.teamStats;
  const lastRefresh = activityData.lastRefresh;

  useEffect(() => {
    const interval = setInterval(() => { void refetch(); }, refreshInterval);
    return () => clearInterval(interval);
  }, [refetch, refreshInterval]);

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return ts;
    }
  };

  if (isLoading) {
    return (
      <Card padding="lg">
        <div className={styles.skeleton}>
          <Skeleton width="60%" height={20} />
          <Skeleton variant="rect" height={40} />
          <Skeleton variant="rect" height={40} />
          <Skeleton variant="rect" height={40} />
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <div className={styles.widget}>
        {/* Header */}
        <div className={styles.widgetHeader}>
          <div className={styles.widgetTitle}>
            <span>📋</span> Recent Activity
          </div>
          <Link href="/audit" className={styles.viewAllLink}>
            View All →
          </Link>
        </div>

        {/* Quick Stats */}
        <div className={styles.quickStats}>
          <div className={styles.statChip}>
            <span className={styles.statChipValue}>{teamStats.activeMembers}</span>
            <span className={styles.statChipLabel}>Active Members</span>
          </div>
          <div className={styles.statChip}>
            <span className={styles.statChipValue}>{teamStats.pendingInvites}</span>
            <span className={styles.statChipLabel}>Pending Invites</span>
          </div>
        </div>

        {/* Activity List */}
        {activities.length === 0 ? (
          <div className={styles.emptyState}>
            <span>📋</span>
            <p>No recent activity</p>
          </div>
        ) : (
          <div className={styles.activityList}>
            {activities.slice(0, maxItems).map((activity) => (
              <div key={activity.id} className={styles.activityItem}>
                <div className={styles.activityIcon}>
                  {ACTION_ICONS[activity.action] || '📌'}
                </div>
                <div className={styles.activityContent}>
                  <span className={styles.activityDescription}>
                    {ACTION_LABELS[activity.action] || activity.action}{' '}
                    <span>{activity.targetType}</span>
                  </span>
                  <span className={styles.activityTimestamp}>
                    {formatTimestamp(activity.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Auto-refresh indicator */}
        {lastRefresh && (
          <div className={styles.refreshIndicator}>
            Auto-refreshes every {Math.round(refreshInterval / 1000)}s
          </div>
        )}
      </div>
    </Card>
  );
}
