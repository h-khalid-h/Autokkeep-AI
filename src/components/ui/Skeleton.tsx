'use client';

import React from 'react';
import styles from './Skeleton.module.css';

/* ─── Types ────────────────────────────────── */

export type SkeletonVariant = 'text' | 'circle' | 'rect';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Width of the skeleton (CSS value) */
  width?: string | number;
  /** Height of the skeleton (CSS value) */
  height?: string | number;
  /** Shape variant */
  variant?: SkeletonVariant;
  /** Number of skeleton lines (for text variant) */
  count?: number;
  /** Additional class name for composition */
  className?: string;
}

/* ─── Component ────────────────────────────── */

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ width, height, variant = 'text', count = 1, className, ...rest }, ref) => {
    const singleClasses = [styles.skeleton, styles[variant], className ?? '']
      .filter(Boolean)
      .join(' ');

    const dimensionStyle: React.CSSProperties = {};
    if (width !== undefined) dimensionStyle.width = typeof width === 'number' ? `${width}px` : width;
    if (height !== undefined) dimensionStyle.height = typeof height === 'number' ? `${height}px` : height;

    // For circle: make equal dimensions
    if (variant === 'circle' && width !== undefined && height === undefined) {
      dimensionStyle.height = dimensionStyle.width;
    }

    if (count <= 1) {
      return (
        <div
          ref={ref}
          className={singleClasses}
          style={Object.keys(dimensionStyle).length > 0 ? dimensionStyle : undefined}
          aria-hidden="true"
          {...rest}
        />
      );
    }

    // Multiple lines
    return (
      <div ref={ref} className={styles.group} aria-hidden="true" {...rest}>
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className={singleClasses}
            style={
              i === count - 1
                ? { ...dimensionStyle, width: dimensionStyle.width ?? '75%' }
                : dimensionStyle.height
                  ? { height: dimensionStyle.height }
                  : undefined
            }
          />
        ))}
      </div>
    );
  }
);

Skeleton.displayName = 'Skeleton';

export { Skeleton };
export default Skeleton;
