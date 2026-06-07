'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import styles from './quick-actions.module.css';

// ── Action Definitions ───────────────────────────────────────────────────────────

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  href: string;
  color: string;
}

const ACTIONS: QuickAction[] = [
  {
    id: 'import-csv',
    label: 'Import CSV',
    description: 'Upload transaction data',
    icon: '📥',
    href: '/import',
    color: 'var(--color-accent)',
  },
  {
    id: 'generate-report',
    label: 'Generate Report',
    description: 'Create financial reports',
    icon: '📊',
    href: '/reports',
    color: 'var(--color-success)',
  },
  {
    id: 'view-analytics',
    label: 'View Analytics',
    description: 'Dashboard insights',
    icon: '📈',
    href: '/analytics',
    color: 'var(--color-warning)',
  },
  {
    id: 'invite-member',
    label: 'Invite Team Member',
    description: 'Add to your team',
    icon: '👥',
    href: '/settings/team',
    color: 'var(--color-info)',
  },
];

// ── Component ────────────────────────────────────────────────────────────────────

export default function QuickActions() {
  const [recentSearches] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('autokkeep_recent_searches');
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        return parsed.slice(0, 3);
      }
    } catch {
      // Ignore localStorage errors
    }
    return [];
  });
  const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac');
  const modKey = isMac ? '⌘' : 'Ctrl';

  return (
    <Card padding="lg">
      <div className={styles.widget}>
        {/* Title */}
        <div className={styles.widgetTitle}>
          <span>⚡</span> Quick Actions
          <span className={styles.shortcutHint}>{modKey}+K</span>
        </div>

        {/* Actions Grid */}
        <div className={styles.actionsGrid}>
          {ACTIONS.map((action) => (
            <Link
              key={action.id}
              href={action.href}
              className={styles.actionCard}
              id={`quick-action-${action.id}`}
            >
              <span className={styles.actionIcon}>{action.icon}</span>
              <span className={styles.actionLabel}>{action.label}</span>
              <span className={styles.actionDescription}>{action.description}</span>
            </Link>
          ))}
        </div>

        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <div className={styles.recentSearches}>
            <span className={styles.recentTitle}>Recent Searches</span>
            {recentSearches.map((search, i) => (
              <div key={i} className={styles.recentSearchItem}>
                <span className={styles.searchIcon}>🔍</span>
                <span>{search}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
