'use client';

import { formatCurrency } from '@/lib/currency/converter';
import styles from '@/app/tax/page.module.css';

interface DeductionCategory {
  category: string;
  amount: number;
  count: number;
}

const barColors = [
  'var(--color-accent)',
  'var(--color-success)',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
  '#14b8a6',
  '#e11d48',
  '#a855f7',
];

export default function DeductionBarChart({ categories, currency }: { categories: DeductionCategory[]; currency: string }) {
  if (categories.length === 0) {
    return (
      <div className={styles.barChartEmpty}>
        No deductible expenses found
      </div>
    );
  }

  const maxAmount = Math.max(...categories.map(c => c.amount));

  return (
    <div className={styles.barRow}>
      {categories.slice(0, 10).map((cat, i) => {
        const barWidth = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
        const color = barColors[i % barColors.length];

        return (
          <div key={cat.category}>
            <div className={styles.barLabel}>
              <span className={styles.barLabelName}>{cat.category}</span>
              <span className={styles.barLabelValue}>
                {formatCurrency(cat.amount, currency)} ({cat.count})
              </span>
            </div>
            <svg width="100%" height="8" style={{ display: 'block' }}>
              <rect x="0" y="0" width="100%" height="8" rx="4" fill="var(--color-border-primary)" />
              <rect
                x="0"
                y="0"
                width={`${barWidth}%`}
                height="8"
                rx="4"
                fill={color}
                style={{ transition: 'width 0.8s ease-out' }}
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
