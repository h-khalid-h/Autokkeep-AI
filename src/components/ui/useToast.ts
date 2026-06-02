'use client';

import { useContext, useMemo } from 'react';
import { ToastContext } from './ToastProvider';
import type { ToastContextValue } from './ToastProvider';

/**
 * Extended toast API with convenience methods.
 */
interface UseToastReturn extends ToastContextValue {
  /** Show a success toast */
  success: (message: string) => string;
  /** Show an error toast */
  error: (message: string) => string;
  /** Show a warning toast */
  warning: (message: string) => string;
  /** Show an info toast */
  info: (message: string) => string;
}

/**
 * Hook to access the toast notification system.
 *
 * Must be used within a `<ToastProvider>`.
 *
 * @example
 * ```tsx
 * const toast = useToast();
 * toast.success('Saved successfully!');
 * toast.error('Something went wrong');
 * toast.info('Tip: you can use keyboard shortcuts');
 * // Or the low-level API:
 * toast.toast({ title: 'Custom', variant: 'success' });
 * ```
 */
export function useToast(): UseToastReturn {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }

  return useMemo(() => ({
    ...context,
    success: (message: string) => context.toast({ title: message, variant: 'success' }),
    error: (message: string) => context.toast({ title: message, variant: 'error' }),
    warning: (message: string) => context.toast({ title: message, variant: 'warning' }),
    info: (message: string) => context.toast({ title: message, variant: 'info' }),
  }), [context]);
}
