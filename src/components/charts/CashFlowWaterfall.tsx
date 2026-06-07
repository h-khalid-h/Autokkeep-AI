'use client';

import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { formatCurrency } from '@/lib/currency/converter';
import styles from './charts.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WaterfallItem {
  label: string;
  amount: number; // positive = inflow, negative = outflow
  type: 'inflow' | 'outflow' | 'total';
}

interface CashFlowWaterfallProps {
  items: WaterfallItem[];
  currency: string;
  title?: string;
  subtitle?: string;
}

// ─── Internal waterfall bar data ────────────────────────────────────────────

interface WaterfallBar {
  label: string;
  base: number;     // invisible base (stacked below)
  value: number;     // visible bar height
  total: number;     // cumulative total at this point
  amount: number;    // raw signed amount
  type: 'inflow' | 'outflow' | 'total';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildWaterfallBars(items: WaterfallItem[]): WaterfallBar[] {
  const bars: WaterfallBar[] = [];
  let cumulative = 0;

  for (const item of items) {
    if (item.type === 'total') {
      // Total bar starts from 0 to the cumulative value
      bars.push({
        label: item.label,
        base: Math.min(0, cumulative),
        value: Math.abs(cumulative),
        total: cumulative,
        amount: cumulative,
        type: 'total',
      });
    } else {
      const prevCumulative = cumulative;
      cumulative += item.amount;

      if (item.amount >= 0) {
        // Inflow: bar goes up from previous cumulative
        bars.push({
          label: item.label,
          base: prevCumulative,
          value: item.amount,
          total: cumulative,
          amount: item.amount,
          type: 'inflow',
        });
      } else {
        // Outflow: bar goes down from previous cumulative
        bars.push({
          label: item.label,
          base: cumulative,
          value: Math.abs(item.amount),
          total: cumulative,
          amount: item.amount,
          type: 'outflow',
        });
      }
    }
  }

  return bars;
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const COLORS = {
  inflow: 'var(--chart-income, #22c55e)',
  outflow: 'var(--chart-expense, #ef4444)',
  total: 'var(--chart-net, #6366f1)',
  base: 'transparent',
};

// ─── Custom Tooltip ─────────────────────────────────────────────────────────

interface WaterfallTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: WaterfallBar;
  }>;
  currency: string;
}

function WaterfallTooltip({ active, payload, currency }: WaterfallTooltipProps) {
  if (!active || !payload?.length) return null;

  const bar = payload[0]?.payload;
  if (!bar) return null;

  const typeLabels = {
    inflow: '↑ Inflow',
    outflow: '↓ Outflow',
    total: '═ Total',
  };

  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{bar.label}</p>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipName}>
          <span
            className={styles.tooltipDot}
            style={{ backgroundColor: COLORS[bar.type] }}
          />
          {typeLabels[bar.type]}
        </span>
        <span className={styles.tooltipValue}>
          {formatCurrency(Math.abs(bar.amount), currency)}
        </span>
      </div>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipName}>Running Total</span>
        <span className={styles.tooltipValue}>
          {formatCurrency(bar.total, currency)}
        </span>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CashFlowWaterfall({
  items,
  currency,
  title = 'Cash Flow Waterfall',
  subtitle = 'Cumulative inflows and outflows',
}: CashFlowWaterfallProps) {
  const bars = useMemo(() => buildWaterfallBars(items), [items]);

  if (!items || items.length === 0) {
    return (
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.chartTitle}>{title}</h3>
            <p className={styles.chartSubtitle}>{subtitle}</p>
          </div>
        </div>
        <div className={styles.chartEmpty}>No waterfall data available</div>
      </div>
    );
  }

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>{title}</h3>
          <p className={styles.chartSubtitle}>{subtitle}</p>
        </div>
      </div>

      <div className={styles.chartBody}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={bars}
            margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 6"
              stroke="var(--color-border)"
              vertical={false}
            />

            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
              interval={0}
              angle={-25}
              textAnchor="end"
              height={60}
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
              width={56}
            />

            <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />

            <Tooltip
              content={<WaterfallTooltip currency={currency} />}
              cursor={{ fill: 'var(--color-bg-hover)', opacity: 0.5 }}
            />

            {/* Invisible base bar (stacking effect) */}
            <Bar
              dataKey="base"
              stackId="waterfall"
              fill="transparent"
              animationDuration={0}
            />

            {/* Visible value bar */}
            <Bar
              dataKey="value"
              stackId="waterfall"
              radius={[4, 4, 0, 0]}
              animationDuration={600}
            >
              {bars.map((bar, index) => (
                <Cell key={index} fill={COLORS[bar.type]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ backgroundColor: COLORS.inflow }} />
          Inflow
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ backgroundColor: COLORS.outflow }} />
          Outflow
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ backgroundColor: COLORS.total }} />
          Total
        </span>
      </div>
    </div>
  );
}
