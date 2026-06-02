'use client';

import React, { forwardRef, useState, useRef, useCallback, useEffect } from 'react';
import styles from './Tooltip.module.css';

/* ─── Types ──────────────────────────────────── */
type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: string;
  side?: TooltipSide;
  delay?: number;
  children: React.ReactNode;
  className?: string;
}

/* ─── Side class map ─────────────────────────── */
const sideClasses: Record<TooltipSide, string> = {
  top: styles.top,
  bottom: styles.bottom,
  left: styles.left,
  right: styles.right,
};

/* ─── Component ──────────────────────────────── */
const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  ({ content, side = 'top', delay = 300, children, className }, ref) => {
    const [visible, setVisible] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const show = useCallback(() => {
      timeoutRef.current = setTimeout(() => setVisible(true), delay);
    }, [delay]);

    const hide = useCallback(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setVisible(false);
    }, []);

    useEffect(() => {
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }, []);

    return (
      <div
        ref={ref}
        className={[styles.wrapper, className].filter(Boolean).join(' ')}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label={content}
      >
        {children}
        <div
          className={[
            styles.tooltip,
            sideClasses[side],
            visible ? styles.tooltipVisible : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="tooltip"
          aria-hidden={!visible}
        >
          {content}
        </div>
      </div>
    );
  }
);

Tooltip.displayName = 'Tooltip';

export { Tooltip };
export type { TooltipProps, TooltipSide };
