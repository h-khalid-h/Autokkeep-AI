'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/lib/currency/converter';
import styles from './charts.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DataPoint {
  month: string;
  income: number;
  expenses: number;
}

interface SpendingTrendChartProps {
  data: DataPoint[];
  currency: string;
}

// ─── Custom Tooltip ─────────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  value?: number;
  dataKey?: string;
  color?: string;
  name?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  currency: string;
}

function ChartTooltip({ active, payload, label, currency }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className={styles.tooltipRow}>
          <span className={styles.tooltipName}>
            <span
              className={styles.tooltipDot}
              style={{ backgroundColor: entry.color }}
            />
            {entry.dataKey === 'income' ? 'Income' : 'Expenses'}
          </span>
          <span className={styles.tooltipValue}>
            {formatCurrency(entry.value ?? 0, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SpendingTrendChart({ data, currency }: SpendingTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.chartTitle}>Spending Trend</h3>
            <p className={styles.chartSubtitle}>6-month income vs expenses</p>
          </div>
        </div>
        <div className={styles.chartEmpty}>No trend data available</div>
      </div>
    );
  }

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>Spending Trend</h3>
          <p className={styles.chartSubtitle}>6-month income vs expenses</p>
        </div>
      </div>

      <div className={styles.chartBody}>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              {/* Income gradient */}
              <linearGradient id="gradientIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
              </linearGradient>
              {/* Expenses gradient */}
              <linearGradient id="gradientExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F97316" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#F97316" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 6"
              stroke="var(--color-border)"
              vertical={false}
            />

            <XAxis
              dataKey="month"
              tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
            />

            <YAxis
              tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => {
                if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                return v.toString();
              }}
              width={48}
            />

            <Tooltip
              content={<ChartTooltip currency={currency} />}
              cursor={{ stroke: 'var(--color-border-strong)', strokeDasharray: '4 4' }}
            />

            <Area
              type="monotone"
              dataKey="income"
              stroke="#10B981"
              strokeWidth={2.5}
              fill="url(#gradientIncome)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#10B981', fill: 'var(--color-bg-surface)' }}
            />

            <Area
              type="monotone"
              dataKey="expenses"
              stroke="#F97316"
              strokeWidth={2.5}
              fill="url(#gradientExpenses)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#F97316', fill: 'var(--color-bg-surface)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Inline legend */}
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ backgroundColor: '#10B981' }} />
          Income
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ backgroundColor: '#F97316' }} />
          Expenses
        </span>
      </div>
    </div>
  );
}
