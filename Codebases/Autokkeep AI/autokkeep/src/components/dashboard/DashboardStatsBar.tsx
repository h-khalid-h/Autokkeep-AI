'use client';

import React from 'react';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface DashboardStatsBarProps {
  stats: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    autoRate: number;
  } | null;
  loading: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

const DashboardStatsBar: React.FC<DashboardStatsBarProps> = ({
  stats,
  loading,
}) => {
  if (loading) {
    return (
      <div
        className="stats-bar"
        role="status"
        aria-label="Loading dashboard statistics"
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          padding: 'var(--space-3) var(--space-5)',
          borderBottom: '1px solid var(--border-primary)',
          background: 'var(--bg-elevated)',
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              flex: 1,
              height: '48px',
              borderRadius: 'var(--radius-sm, 6px)',
            }}
          />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const items = [
    { label: 'Total', value: stats.total, icon: '📊' },
    { label: 'Pending', value: stats.pending, icon: '⏳' },
    { label: 'Approved', value: stats.approved, icon: '✅' },
    { label: 'Rejected', value: stats.rejected, icon: '❌' },
    { label: 'Auto Rate', value: `${stats.autoRate}%`, icon: '🤖' },
  ];

  return (
    <div
      className="stats-bar"
      role="region"
      aria-label="Dashboard statistics"
      style={{
        display: 'flex',
        gap: 'var(--space-4)',
        padding: 'var(--space-3) var(--space-5)',
        borderBottom: '1px solid var(--border-primary)',
        background: 'var(--bg-elevated)',
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-sm, 6px)',
            background: 'var(--bg-secondary)',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '16px' }}>
            {item.icon}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              className="text-caption"
              style={{ fontSize: '10px', textTransform: 'uppercase' }}
            >
              {item.label}
            </span>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>
              {item.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DashboardStatsBar;
