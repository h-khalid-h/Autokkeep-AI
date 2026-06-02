'use client';

import React from 'react';
import styles from './Badge.module.css';

/* ─── Types ────────────────────────────────── */

export type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'accent';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic color variant */
  variant?: BadgeVariant;
  /** Size preset */
  size?: BadgeSize;
  /** Show a colored dot before text */
  dot?: boolean;
  /** Badge content */
  children: React.ReactNode;
  /** Additional class name for composition */
  className?: string;
}

/* ─── Component ────────────────────────────── */

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', size = 'md', dot = false, className, children, ...rest }, ref) => {
    const classNames = [
      styles.badge,
      styles[variant],
      styles[size],
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <span ref={ref} className={classNames} {...rest}>
        {dot && <span className={styles.dot} aria-hidden="true" />}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };
export default Badge;
