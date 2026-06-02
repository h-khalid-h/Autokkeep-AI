'use client';

import React from 'react';
import styles from './Gauge.module.css';

/* ─── Types ──────────────────────────────────── */
type GaugeSize = 'sm' | 'md' | 'lg';
type GaugeColor = 'accent' | 'success' | 'warning' | 'destructive';

interface GaugeProps {
  /** Value from 0 to 100 */
  value: number;
  /** Size variant */
  size?: GaugeSize;
  /** Color variant */
  color?: GaugeColor;
  /** Whether to show the value label */
  showLabel?: boolean;
  /** Optional caption below the value */
  caption?: string;
  /** Additional class name */
  className?: string;
}

/* ─── Class maps ─────────────────────────────── */
const sizeClasses: Record<GaugeSize, string> = {
  sm: styles.gaugeSm,
  md: styles.gaugeMd,
  lg: styles.gaugeLg,
};

const colorClasses: Record<GaugeColor, string> = {
  accent: styles.colorAccent,
  success: styles.colorSuccess,
  warning: styles.colorWarning,
  destructive: styles.colorDestructive,
};

const strokeWidths: Record<GaugeSize, number> = {
  sm: 6,
  md: 8,
  lg: 10,
};

/* ─── Component ──────────────────────────────── */
function Gauge({
  value,
  size = 'md',
  color = 'accent',
  showLabel = true,
  caption,
  className,
}: GaugeProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const strokeWidth = strokeWidths[size];
  const radius = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  return (
    <div
      className={[styles.gauge, sizeClasses[size], className].filter(Boolean).join(' ')}
      role="meter"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={caption ? `${caption}: ${clampedValue}%` : `${clampedValue}%`}
    >
      <svg className={styles.gaugeSvg} viewBox="0 0 100 100">
        {/* Background track */}
        <circle
          className={styles.trackCircle}
          cx="50"
          cy="50"
          r={radius}
          strokeWidth={strokeWidth}
        />
        {/* Value arc */}
        <circle
          className={[styles.valueCircle, colorClasses[color]].join(' ')}
          cx="50"
          cy="50"
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>

      {showLabel && (
        <div className={styles.labelContainer}>
          <span className={styles.labelValue}>{clampedValue}</span>
          {caption && <span className={styles.labelCaption}>{caption}</span>}
        </div>
      )}
    </div>
  );
}

export { Gauge };
export type { GaugeProps, GaugeSize, GaugeColor };
