'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { Card, Badge, Skeleton } from '@/components/ui';
import { formatCurrency } from '@/lib/currency/converter';
import styles from './RecentActivity.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  action: string;
  entity_id: string;
  user_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Action config ──────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { icon: string; label: string; variant: 'success' | 'warning' | 'destructive' | 'info' | 'default' }> = {
  'transaction.approved':         { icon: '✅', label: 'Approved',       variant: 'success' },
  'transaction.rejected':         { icon: '❌', label: 'Rejected',       variant: 'destructive' },
  'transaction.categorized':      { icon: '🏷️', label: 'Categorized',   variant: 'info' },
  'transaction.synced':           { icon: '🔄', label: 'Synced',        variant: 'success' },
  'transaction.created':          { icon: '➕', label: 'Created',        variant: 'default' },
  'entity.created':               { icon: '🏢', label: 'Entity Created', variant: 'info' },
  'entity.updated':               { icon: '✏️', label: 'Entity Updated', variant: 'default' },
  'account.created':              { icon: '📒', label: 'GL Account',     variant: 'info' },
  'account.deleted':              { icon: '🗑️', label: 'GL Deleted',    variant: 'destructive' },
  'period.closed':                { icon: '🔒', label: 'Period Closed',  variant: 'success' },
  'receipt.uploaded':             { icon: '📄', label: 'Receipt',        variant: 'default' },
  'bank.connected':               { icon: '🏦', label: 'Bank Connected', variant: 'success' },
  'settings.updated':             { icon: '⚙️', label: 'Settings',      variant: 'default' },
  'member.invited':               { icon: '👤', label: 'Member Invited', variant: 'info' },
  'member.removed':               { icon: '👤', label: 'Member Removed', variant: 'destructive' },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || { icon: '📌', label: action.replace(/\./g, ' '), variant: 'default' as const };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getDescription(entry: AuditEntry, currency?: string): string {
  const meta = entry.metadata || {};
  const merchant = meta.merchant_name as string || meta.merchant as string || '';
  const amount = meta.amount as number || 0;
  const glCode = meta.gl_code as string || meta.glCode as string || '';

  if (entry.action.startsWith('transaction.') && merchant) {
    return amount ? `${merchant} — ${formatCurrency(Math.abs(amount), currency)}` : merchant;
  }
  if (glCode) return `GL ${glCode}`;
  if (meta.entity_name) return meta.entity_name as string;
  if (meta.email) return meta.email as string;
  return '';
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function RecentActivity() {
  const { selectedEntity } = useEntity();
  const [entries, setEntries] = React.useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!selectedEntity?.id) return;
    const entityId = selectedEntity.id;
    let cancelled = false;

    async function fetchActivity() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/audit?entityId=${entityId}&limit=8`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setEntries(data.auditLogs || []);
      } catch {
        // Non-critical — silently degrade
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchActivity();
    return () => { cancelled = true; };
  }, [selectedEntity?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render if no entity selected
  if (!selectedEntity?.id) return null;

  // Loading skeleton
  if (isLoading) {
    return (
      <Card padding="md" className={styles.activityCard}>
        <h3 className={styles.activityTitle}>📋 Recent Activity</h3>
        <div className={styles.activityList}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={styles.activityItem}>
              <Skeleton variant="circle" width={32} height={32} />
              <div className={styles.activityContent}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="40%" height={12} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // No activity yet
  if (entries.length === 0) {
    return (
      <Card padding="md" className={styles.activityCard}>
        <h3 className={styles.activityTitle}>📋 Recent Activity</h3>
        <p className={styles.activityEmpty}>
          No activity recorded yet. Actions like approving transactions, connecting banks, and updating settings will appear here.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="md" className={styles.activityCard}>
      <h3 className={styles.activityTitle}>📋 Recent Activity</h3>
      <div className={styles.activityList}>
        {entries.map(entry => {
          const config = getActionConfig(entry.action);
          const description = getDescription(entry, selectedEntity?.currency);

          return (
            <div key={entry.id} className={styles.activityItem}>
              <span className={styles.activityIcon} aria-hidden="true">
                {config.icon}
              </span>
              <div className={styles.activityContent}>
                <div className={styles.activityRow}>
                  <Badge variant={config.variant} size="sm">
                    {config.label}
                  </Badge>
                  <span className={styles.activityTime}>
                    {timeAgo(entry.created_at)}
                  </span>
                </div>
                {description && (
                  <span className={styles.activityDescription}>
                    {description}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
