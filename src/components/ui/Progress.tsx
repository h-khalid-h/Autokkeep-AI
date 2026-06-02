import React, { forwardRef } from 'react';
import styles from './Progress.module.css';

/* ─── Types ──────────────────────────────────── */
type ProgressVariant = 'bar' | 'circle';
type ProgressSize = 'sm' | 'md' | 'lg';
type ProgressColor = 'accent' | 'success' | 'warning' | 'destructive';

interface ProgressProps {
  value: number;
  variant?: ProgressVariant;
  size?: ProgressSize;
  color?: ProgressColor;
  showLabel?: boolean;
  className?: string;
}

/* ─── Color maps ─────────────────────────────── */
const barColorClasses: Record<ProgressColor, string> = {
  accent: styles.colorAccent,
  success: styles.colorSuccess,
  warning: styles.colorWarning,
  destructive: styles.colorDestructive,
};

const strokeColorClasses: Record<ProgressColor, string> = {
  accent: styles.strokeAccent,
  success: styles.strokeSuccess,
  warning: styles.strokeWarning,
  destructive: styles.strokeDestructive,
};

/* ─── Bar track size classes ─────────────────── */
const barTrackSizeClasses: Record<ProgressSize, string> = {
  sm: styles.barTrackSm,
  md: styles.barTrackMd,
  lg: styles.barTrackLg,
};

/* ─── Circle sizes ───────────────────────────── */
const circleSizes: Record<ProgressSize, { size: number; stroke: number }> = {
  sm: { size: 48, stroke: 4 },
  md: { size: 72, stroke: 6 },
  lg: { size: 96, stroke: 8 },
};

const circleLabelClasses: Record<ProgressSize, string> = {
  sm: styles.circleLabelSm,
  md: styles.circleLabelMd,
  lg: styles.circleLabelLg,
};

/* ─── Bar Variant ────────────────────────────── */
function BarProgress({
  value,
  size,
  color,
  showLabel,
}: {
  value: number;
  size: ProgressSize;
  color: ProgressColor;
  showLabel: boolean;
}) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className={styles.barWrapper}>
      <div
        className={[styles.barTrack, barTrackSizeClasses[size]].join(' ')}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${clampedValue}% progress`}
      >
        <div
          className={[styles.barFill, barColorClasses[color]].join(' ')}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && (
        <span className={styles.barLabel}>{clampedValue}%</span>
      )}
    </div>
  );
}

/* ─── Circle Variant ─────────────────────────── */
function CircleProgress({
  value,
  size,
  color,
  showLabel,
}: {
  value: number;
  size: ProgressSize;
  color: ProgressColor;
  showLabel: boolean;
}) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const { size: svgSize, stroke } = circleSizes[size];
  const radius = (svgSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedValue / 100) * circumference;

  return (
    <div
      className={styles.circleWrapper}
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${clampedValue}% progress`}
    >
      <svg
        className={styles.circleSvg}
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
      >
        <circle
          className={styles.circleTrack}
          cx={svgSize / 2}
          cy={svgSize / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className={[styles.circleFill, strokeColorClasses[color]].join(' ')}
          cx={svgSize / 2}
          cy={svgSize / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {showLabel && (
        <span className={[styles.circleLabel, circleLabelClasses[size]].join(' ')}>
          {clampedValue}%
        </span>
      )}
    </div>
  );
}

/* ─── Main Component ─────────────────────────── */
const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      value,
      variant = 'bar',
      size = 'md',
      color = 'accent',
      showLabel = false,
      className,
    },
    ref
  ) => {
    return (
      <div ref={ref} className={className}>
        {variant === 'bar' ? (
          <BarProgress value={value} size={size} color={color} showLabel={showLabel} />
        ) : (
          <CircleProgress value={value} size={size} color={color} showLabel={showLabel} />
        )}
      </div>
    );
  }
);

Progress.displayName = 'Progress';

export { Progress };
export type { ProgressProps, ProgressVariant, ProgressSize, ProgressColor };
