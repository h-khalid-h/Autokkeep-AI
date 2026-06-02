'use client';

import React from 'react';
import styles from './Input.module.css';

/* ─── Types ────────────────────────────────── */

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label displayed above the input */
  label?: string;
  /** Helper text displayed below the input */
  helperText?: string;
  /** Error message — replaces helper text and triggers error styling */
  error?: string;
  /** Icon rendered inside the input on the left */
  leftIcon?: React.ReactNode;
  /** Icon rendered inside the input on the right */
  rightIcon?: React.ReactNode;
  /** Size preset */
  size?: InputSize;
  /** Additional class name for the wrapper */
  className?: string;
}

/* ─── Size map ─────────────────────────────── */

const sizeMap: Record<InputSize, string> = {
  sm: styles.inputSm,
  md: styles.inputMd,
  lg: styles.inputLg,
};

/* ─── Component ────────────────────────────── */

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      leftIcon,
      rightIcon,
      size = 'md',
      className,
      id,
      'aria-describedby': ariaDescribedBy,
      ...rest
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const helperTextId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    const hasError = Boolean(error);
    const describedBy = [
      ariaDescribedBy,
      hasError ? errorId : helperText ? helperTextId : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    const inputClasses = [
      styles.input,
      sizeMap[size],
      hasError ? styles.inputError : '',
      leftIcon ? styles.hasLeftIcon : '',
      rightIcon ? styles.hasRightIcon : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={[styles.wrapper, className ?? ''].filter(Boolean).join(' ')}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
        )}

        <div className={styles.inputContainer}>
          {leftIcon && (
            <span className={styles.leftIcon} aria-hidden="true">
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={inputClasses}
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            {...rest}
          />

          {rightIcon && (
            <span className={styles.rightIcon} aria-hidden="true">
              {rightIcon}
            </span>
          )}
        </div>

        {hasError && (
          <span id={errorId} className={styles.errorText} role="alert">
            {error}
          </span>
        )}
        {!hasError && helperText && (
          <span id={helperTextId} className={styles.helperText}>
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
export default Input;
