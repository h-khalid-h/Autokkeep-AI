'use client';

import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
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
  net: number;
}

interface CashFlowBarChartProps {
  data: DataPoint[];
  currency: string;
}

// ─── Custom Tooltip ─────────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  value?: number;
  dataKey?: string;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  currency: string;
}

const LABEL_MAP: Record<string, string> = {
  income: 'Income',
  expenses: 'Expenses',
  net: 'Net Cash Flow',
};

function CashFlowTooltip({ active, payload, label, currency }: CustomTooltipProps) {
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
            {LABEL_MAP[entry.dataKey ?? ''] ?? entry.dataKey}
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

export default function CashFlowBarChart({ data, currency }: CashFlowBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.chartTitle}>Cash Flow</h3>
            <p className={styles.chartSubtitle}>Monthly income vs expenses</p>
          </div>
        </div>
        <div className={styles.chartEmpty}>No cash flow data available</div>
      </div>
    );
  }

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>Cash Flow</h3>
          <p className={styles.chartSubtitle}>Monthly income vs expenses with net trend</p>
        </div>
      </div>

      <div className={styles.chartBody}>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="barIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-income)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="var(--chart-income-dark)" stopOpacity={0.7} />
              </linearGradient>
              <linearGradient id="barExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-expense)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="var(--chart-expense-dark)" stopOpacity={0.7} />
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
                if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                return v.toString();
              }}
              width={48}
            />

            <Tooltip
              content={<CashFlowTooltip currency={currency} />}
              cursor={{ fill: 'var(--color-bg-hover)' }}
            />

            <Bar
              dataKey="income"
              fill="url(#barIncomeGrad)"
              radius={[4, 4, 0, 0]}
              barSize={20}
              animationDuration={600}
            />

            <Bar
              dataKey="expenses"
              fill="url(#barExpenseGrad)"
              radius={[4, 4, 0, 0]}
              barSize={20}
              animationDuration={600}
            />

            <Line
              type="monotone"
              dataKey="net"
              stroke="var(--chart-net)"
              strokeWidth={2.5}
              dot={{ r: 4, fill: 'var(--chart-net)', stroke: 'var(--color-bg-surface)', strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--chart-net)', fill: 'var(--color-bg-surface)' }}
              animationDuration={800}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ backgroundColor: 'var(--chart-income)' }} />
          Income
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ backgroundColor: 'var(--chart-expense)' }} />
          Expenses
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ backgroundColor: 'var(--chart-net)' }} />
          Net Cash Flow
        </span>
      </div>
    </div>
  );
}
