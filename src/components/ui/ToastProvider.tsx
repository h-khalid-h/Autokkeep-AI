'use client';

import React, {
  createContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import styles from './Toast.module.css';

/* ─── Types ──────────────────────────────────── */
type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 5000;

/* ─── Context ────────────────────────────────── */
const ToastContext = createContext<ToastContextValue | null>(null);

/* ─── Icons ──────────────────────────────────── */
const variantIcons: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

/* ─── Toast Item ─────────────────────────────── */
function ToastItem({
  data,
  onDismiss,
}: {
  data: ToastData;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleDismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(data.id), 200);
  }, [data.id, onDismiss]);

  useEffect(() => {
    const duration = data.duration ?? DEFAULT_DURATION;
    if (duration > 0) {
      timerRef.current = setTimeout(handleDismiss, duration);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data.duration, handleDismiss]);

  const variant = data.variant ?? 'info';

  const variantClass: Record<ToastVariant, string> = {
    success: styles.variantSuccess,
    error: styles.variantError,
    warning: styles.variantWarning,
    info: styles.variantInfo,
  };

  const iconClass: Record<ToastVariant, string> = {
    success: styles.iconSuccess,
    error: styles.iconError,
    warning: styles.iconWarning,
    info: styles.iconInfo,
  };

  return (
    <div
      className={[
        styles.toast,
        variantClass[variant],
        exiting ? styles.toastExiting : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <span className={[styles.icon, iconClass[variant]].join(' ')} aria-hidden="true">
        {variantIcons[variant]}
      </span>
      <div className={styles.content}>
        <p className={styles.title}>{data.title}</p>
        {data.description && (
          <p className={styles.description}>{data.description}</p>
        )}
      </div>
      <button
        className={styles.dismiss}
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        type="button"
      >
        ✕
      </button>
    </div>
  );
}

/* ─── Provider ───────────────────────────────── */
let idCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const toast = useCallback((options: ToastOptions): string => {
    const id = `toast-${++idCounter}-${Date.now()}`;
    const newToast: ToastData = { id, ...options };
    setToasts((prev) => {
      const next = [newToast, ...prev];
      return next.slice(0, MAX_TOASTS);
    });
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className={styles.container} aria-label="Notifications">
        {toasts.map((t) => (
          <ToastItem key={t.id} data={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ─── Export context for hook ────────────────── */
export { ToastContext };
export type { ToastOptions, ToastVariant, ToastContextValue };
