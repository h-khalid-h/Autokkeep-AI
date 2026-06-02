'use client';

import React, { useCallback } from 'react';
import styles from './Toggle.module.css';

/* ─── Types ────────────────────────────────── */

export type ToggleSize = 'sm' | 'md';

export interface ToggleProps {
  /** Whether the toggle is on */
  checked: boolean;
  /** Callback when the toggle changes */
  onChange: (checked: boolean) => void;
  /** Label displayed next to the toggle */
  label?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Size preset */
  size?: ToggleSize;
  /** Additional class name for composition */
  className?: string;
  /** Accessible name when no label is provided */
  'aria-label'?: string;
}

/* ─── Component ────────────────────────────── */

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  (
    {
      checked,
      onChange,
      label,
      disabled = false,
      size = 'md',
      className,
      'aria-label': ariaLabel,
    },
    ref
  ) => {
    const handleClick = useCallback(() => {
      if (!disabled) {
        onChange(!checked);
      }
    }, [checked, disabled, onChange]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (disabled) return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange(!checked);
        }
      },
      [checked, disabled, onChange]
    );

    const wrapperClasses = [
      styles.wrapper,
      disabled ? styles.disabled : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    const trackClasses = [
      styles.track,
      size === 'sm' ? styles.trackSm : styles.trackMd,
      checked ? styles.checked : '',
    ]
      .filter(Boolean)
      .join(' ');

    const knobClasses = [
      styles.knob,
      size === 'sm' ? styles.knobSm : styles.knobMd,
    ]
      .filter(Boolean)
      .join(' ');

    const labelClasses = [
      styles.label,
      size === 'sm' ? styles.labelSm : '',
    ]
      .filter(Boolean)
      .join(' ');

    const toggleId = React.useId();

    return (
      <div className={wrapperClasses} onClick={handleClick}>
        <button
          ref={ref}
          id={toggleId}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={!label ? ariaLabel : undefined}
          disabled={disabled}
          className={trackClasses}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          <span className={knobClasses} aria-hidden="true" />
        </button>
        {label && (
          <label htmlFor={toggleId} className={labelClasses}>
            {label}
          </label>
        )}
      </div>
    );
  }
);

Toggle.displayName = 'Toggle';

export { Toggle };
export default Toggle;
