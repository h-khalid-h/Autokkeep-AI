'use client';

import React, { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/lib/currency/converter';
import { getChartColorPalette } from './chart-helpers';
import styles from './charts.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DataPoint {
  name: string;
  value: number;
  code: string;
}

interface CategoryDonutChartProps {
  data: DataPoint[];
  currency: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_CATEGORIES = 8;
const COLORS = getChartColorPalette();

// ─── Custom Tooltip ─────────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  value?: number;
  name?: string;
  payload?: DataPoint & { fill?: string };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  currency: string;
}

function DonutTooltip({ active, payload, currency }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  const color = entry.payload?.fill ?? COLORS[0];

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipName}>
          <span className={styles.tooltipDot} style={{ backgroundColor: color }} />
          {entry.name}
        </span>
        <span className={styles.tooltipValue}>
          {formatCurrency(entry.value ?? 0, currency)}
        </span>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CategoryDonutChart({ data, currency }: CategoryDonutChartProps) {
  // Group small categories as "Other"
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const sorted = [...data].sort((a, b) => b.value - a.value);

    if (sorted.length <= MAX_CATEGORIES) return sorted;

    const shown = sorted.slice(0, MAX_CATEGORIES - 1);
    const others = sorted.slice(MAX_CATEGORIES - 1);
    const otherTotal = others.reduce((sum, d) => sum + d.value, 0);

    return [...shown, { name: 'Other', value: otherTotal, code: 'OTHER' }];
  }, [data]);

  const total = useMemo(
    () => chartData.reduce((sum, d) => sum + d.value, 0),
    [chartData]
  );

  if (chartData.length === 0) {
    return (
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.chartTitle}>Expense Categories</h3>
            <p className={styles.chartSubtitle}>Breakdown by category</p>
          </div>
        </div>
        <div className={styles.chartEmpty}>No category data available</div>
      </div>
    );
  }

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>Expense Categories</h3>
          <p className={styles.chartSubtitle}>Breakdown by category</p>
        </div>
      </div>

      <div className={styles.chartBody} style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              stroke="none"
              animationBegin={0}
              animationDuration={800}
            >
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
                />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label overlay */}
        <div
          className={styles.donutCenter}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        >
          <span className={styles.donutCenterLabel}>Total</span>
          <span className={styles.donutCenterValue}>
            {formatCurrency(total, currency)}
          </span>
        </div>
      </div>

      {/* Category legend */}
      <div className={styles.legend}>
        {chartData.map((entry, i) => (
          <span key={entry.code} className={styles.legendItem}>
            <span
              className={styles.legendDot}
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            {entry.name}
          </span>
        ))}
      </div>
    </div>
  );
}
