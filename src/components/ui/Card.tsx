'use client';

import React from 'react';
import styles from './Card.module.css';

/* ─── Types ────────────────────────────────── */

export type CardVariant = 'default' | 'elevated' | 'interactive' | 'accent';
export type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant */
  variant?: CardVariant;
  /** Internal padding */
  padding?: CardPadding;
  /** Additional class name for composition */
  className?: string;
  /** Card content */
  children: React.ReactNode;
}

/* ─── Padding map ──────────────────────────── */

const paddingMap: Record<CardPadding, string> = {
  sm: styles.paddingSm,
  md: styles.paddingMd,
  lg: styles.paddingLg,
};

/* ─── Component ────────────────────────────── */

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', className, children, ...rest }, ref) => {
    const classNames = [
      styles.card,
      styles[variant],
      paddingMap[padding],
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    const interactiveProps =
      variant === 'interactive'
        ? { tabIndex: 0, role: 'button' as const }
        : {};

    return (
      <div ref={ref} className={classNames} {...interactiveProps} {...rest}>
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export { Card };
export default Card;
