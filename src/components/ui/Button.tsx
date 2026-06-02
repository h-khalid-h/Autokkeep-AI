'use client';

import React from 'react';
import styles from './Button.module.css';

/* ─── Types ────────────────────────────────── */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** Visual variant */
  variant?: ButtonVariant;
  /** Size preset */
  size?: ButtonSize;
  /** Show loading spinner and disable interaction */
  isLoading?: boolean;
  /** Icon rendered before children */
  leftIcon?: React.ReactNode;
  /** Icon rendered after children */
  rightIcon?: React.ReactNode;
  /** Render as a different element (e.g. Link for links) */
  as?: React.ElementType;
  /** Additional class name for composition */
  className?: string;
  /** For polymorphic usage — href when as={Link} */
  href?: string;
}

/* ─── Spinner SVG ──────────────────────────── */

function Spinner({ size }: { size: ButtonSize }) {
  const px = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;
  return (
    <span className={styles.spinner} aria-hidden="true">
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="3"
          fill="none"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  );
}

/* ─── Size/variant class maps ─────────────── */
const variantClasses: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  destructive: styles.destructive,
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

/* ─── Component ────────────────────────────── */

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className,
      children,
      as,
      href,
      ...rest
    },
    ref
  ) => {
    const Component = as || (href ? 'a' : 'button');

    const classNames = [
      styles.button,
      variantClasses[variant],
      sizeClasses[size],
      isLoading ? styles.loading : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    // Only pass button-specific props when rendering as a <button>
    const elementProps: Record<string, unknown> = { ...rest };
    if (Component === 'button') {
      elementProps.type = rest.type ?? 'button';
      elementProps.disabled = disabled || isLoading;
    }
    if (href) {
      elementProps.href = href;
    }

    return (
      <Component
        ref={ref}
        className={classNames}
        aria-disabled={disabled || isLoading || undefined}
        aria-busy={isLoading || undefined}
        {...elementProps}
      >
        {isLoading && <Spinner size={size} />}
        {!isLoading && leftIcon && (
          <span className={styles.leftIcon} aria-hidden="true">
            {leftIcon}
          </span>
        )}
        {children}
        {!isLoading && rightIcon && (
          <span className={styles.rightIcon} aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </Component>
    );
  }
);

Button.displayName = 'Button';

export { Button };
export default Button;
