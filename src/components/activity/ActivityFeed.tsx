'use client';

import styles from './activity-feed.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface Activity {
  id: string;
  entityId: string;
  actorId: string;
  actorType: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  timestamp: string;
  description: string;
}

interface ActivityFeedProps {
  activities: Activity[];
  compact?: boolean;
  maxItems?: number;
  showLoadMore?: boolean;
  onLoadMore?: () => void;
  isLoading?: boolean;
}

// ─── Action Color Map ───────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  create: 'var(--color-success)',
  update: 'var(--color-accent)',
  delete: 'var(--color-destructive)',
  categorize: 'var(--color-warning)',
  approve: 'var(--color-success)',
  revoke: 'var(--color-destructive)',
  export: 'var(--color-info, var(--color-accent))',
  sync: 'var(--color-accent)',
  login: 'var(--color-success)',
  connect: 'var(--color-success)',
  disconnect: 'var(--color-warning)',
};

const ACTION_ICONS: Record<string, string> = {
  create: '➕',
  update: '✏️',
  delete: '🗑️',
  categorize: '🏷️',
  approve: '✅',
  revoke: '↩️',
  export: '📤',
  sync: '🔄',
  login: '🔑',
  connect: '🔗',
  disconnect: '⛓️‍💥',
};

// ─── Activity Feed Component ────────────────────────────────────────────────────

export function ActivityFeed({
  activities,
  compact = false,
  maxItems,
  showLoadMore = false,
  onLoadMore,
  isLoading = false,
}: ActivityFeedProps) {
  const displayActivities = maxItems
    ? activities.slice(0, maxItems)
    : activities;

  if (displayActivities.length === 0 && !isLoading) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>📭</span>
        <p className={styles.emptyText}>No activity yet</p>
        <p className={styles.emptySubtext}>
          Actions like transactions, categorizations, and syncs will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? styles.feedCompact : styles.feed}>
      <div className={styles.timeline}>
        {displayActivities.map((activity, index) => {
          const color = ACTION_COLORS[activity.action] || 'var(--color-text-tertiary)';
          const icon = ACTION_ICONS[activity.action] || '📌';

          return (
            <div
              key={activity.id}
              className={compact ? styles.itemCompact : styles.item}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Timeline dot and line */}
              <div className={styles.timelineIndicator}>
                <div
                  className={styles.dot}
                  style={{ borderColor: color }}
                  title={activity.action}
                >
                  <span className={styles.dotIcon}>{icon}</span>
                </div>
                {index < displayActivities.length - 1 && (
                  <div className={styles.line} />
                )}
              </div>

              {/* Content */}
              <div className={styles.content}>
                <div className={styles.header}>
                  <span className={styles.description}>
                    {activity.description}
                  </span>
                  <span className={styles.timestamp}>
                    {formatTimestamp(activity.timestamp)}
                  </span>
                </div>

                {!compact && (
                  <div className={styles.meta}>
                    <span
                      className={styles.actionBadge}
                      style={{
                        background: `color-mix(in srgb, ${color} 15%, transparent)`,
                        color,
                      }}
                    >
                      {activity.action}
                    </span>
                    <span className={styles.targetType}>
                      {activity.targetType.replace(/_/g, ' ')}
                    </span>
                    {activity.actorType === 'ai' && (
                      <span className={styles.aiTag}>🤖 AI</span>
                    )}
                    {activity.actorType === 'system' && (
                      <span className={styles.systemTag}>⚙️ System</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading activity...</span>
        </div>
      )}

      {/* Load More button */}
      {showLoadMore && !isLoading && activities.length > (maxItems || 0) && (
        <div className={styles.loadMoreWrapper}>
          <button
            className={styles.loadMoreButton}
            onClick={onLoadMore}
            aria-label="Load more activities"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Timestamp Formatter ────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Less than 1 minute
    if (diff < 60_000) return 'Just now';

    // Less than 1 hour
    if (diff < 3_600_000) {
      const mins = Math.floor(diff / 60_000);
      return `${mins}m ago`;
    }

    // Less than 24 hours
    if (diff < 86_400_000) {
      const hours = Math.floor(diff / 3_600_000);
      return `${hours}h ago`;
    }

    // Less than 7 days
    if (diff < 604_800_000) {
      const days = Math.floor(diff / 86_400_000);
      return `${days}d ago`;
    }

    // Older — show date
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return ts;
  }
}
