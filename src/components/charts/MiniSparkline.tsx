'use client';

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import styles from './charts.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MiniSparklineProps {
  data: number[];
  color?: string;
  trend?: 'up' | 'down' | 'flat';
}

// ─── Default colors per trend direction ─────────────────────────────────────

const TREND_COLORS: Record<string, string> = {
  up: '#10B981',   // Emerald green
  down: '#F87171', // Red
  flat: '#94A3B8', // Slate
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function MiniSparkline({ data, color, trend }: MiniSparklineProps) {
  const chartData = useMemo(
    () => data.map((value, index) => ({ index, value })),
    [data]
  );

  const strokeColor = color ?? TREND_COLORS[trend ?? 'flat'] ?? '#94A3B8';

  if (!data || data.length < 2) {
    return <span className={styles.sparklineWrapper} style={{ width: 60, height: 24 }} />;
  }

  return (
    <span className={styles.sparklineWrapper}>
      <ResponsiveContainer width={60} height={24}>
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
            animationDuration={400}
          />
        </LineChart>
      </ResponsiveContainer>
    </span>
  );
}
