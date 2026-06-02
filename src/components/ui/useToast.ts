'use client';

import { useContext } from 'react';
import { ToastContext } from './ToastProvider';
import type { ToastContextValue } from './ToastProvider';

/**
 * Hook to access the toast notification system.
 *
 * Must be used within a `<ToastProvider>`.
 *
 * @example
 * ```tsx
 * const { toast, dismiss } = useToast();
 * toast({ title: 'Saved!', variant: 'success' });
 * ```
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return context;
}
