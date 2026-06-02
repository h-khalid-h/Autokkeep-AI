import React, { forwardRef } from 'react';
import styles from './EmptyState.module.css';

/* ─── Types ──────────────────────────────────── */
interface EmptyStateProps {
  icon?: React.ReactNode | string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/* ─── Component ──────────────────────────────── */
const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, className }, ref) => {
    const renderIcon = () => {
      if (!icon) return null;

      // If it's a string (emoji), render it directly
      if (typeof icon === 'string') {
        return (
          <div className={styles.icon} aria-hidden="true">
            {icon}
          </div>
        );
      }

      // Otherwise it's a React node
      return (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      );
    };

    return (
      <div
        ref={ref}
        className={[styles.container, className].filter(Boolean).join(' ')}
        role="status"
      >
        {renderIcon()}
        <h3 className={styles.title}>{title}</h3>
        {description && <p className={styles.description}>{description}</p>}
        {action && <div className={styles.action}>{action}</div>}
      </div>
    );
  }
);

EmptyState.displayName = 'EmptyState';

export { EmptyState };
export type { EmptyStateProps };
