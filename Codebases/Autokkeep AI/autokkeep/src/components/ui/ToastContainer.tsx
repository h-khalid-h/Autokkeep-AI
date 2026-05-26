'use client';

import React, { useEffect, useState, useCallback } from 'react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Toast Notification System
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
  timestamp: number;
}

// Module-level subscriber pattern so addToast can be called from anywhere
type Subscriber = (toast: Toast) => void;
const subscribers = new Set<Subscriber>();

let toastCounter = 0;

export function addToast(message: string, type: Toast['type']): void {
  const toast: Toast = {
    id: `toast-${++toastCounter}-${Date.now()}`,
    message,
    type,
    timestamp: Date.now(),
  };
  subscribers.forEach((fn) => fn(toast));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Icons
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

const ICONS: Record<Toast['type'], React.FC> = {
  success: CheckIcon,
  info: InfoIcon,
  warning: WarningIcon,
  error: ErrorIcon,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Styles
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TYPE_STYLES: Record<Toast['type'], { border: string; icon: string; bg: string }> = {
  success: {
    border: 'border-emerald-500/40',
    icon: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  info: {
    border: 'border-blue-500/40',
    icon: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  warning: {
    border: 'border-amber-500/40',
    icon: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  error: {
    border: 'border-red-500/40',
    icon: 'text-red-400',
    bg: 'bg-red-500/10',
  },
};

const AUTO_DISMISS_MS = 5000;
const MAX_VISIBLE = 3;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Subscribe to new toasts
  useEffect(() => {
    const handler: Subscriber = (toast) => {
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), toast]);
    };
    subscribers.add(handler);
    return () => {
      subscribers.delete(handler);
    };
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (!toasts.length) return;

    const timers = toasts.map((toast) => {
      const elapsed = Date.now() - toast.timestamp;
      const remaining = Math.max(AUTO_DISMISS_MS - elapsed, 0);
      return setTimeout(() => removeToast(toast.id), remaining);
    });

    return () => timers.forEach(clearTimeout);
  }, [toasts, removeToast]);

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none"
      style={{ maxWidth: 380 }}
    >
      {toasts.map((toast, idx) => {
        const style = TYPE_STYLES[toast.type];
        const Icon = ICONS[toast.type];

        return (
          <div
            key={toast.id}
            role="alert"
            className={`
              pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3
              backdrop-blur-xl shadow-2xl
              ${style.border} ${style.bg}
              bg-gray-900/80 text-white
              animate-[slideIn_0.3s_ease-out]
            `}
            style={{
              animationDelay: `${idx * 50}ms`,
              animationFillMode: 'backwards',
            }}
          >
            <span className={`mt-0.5 flex-shrink-0 ${style.icon}`}>
              <Icon />
            </span>

            <p className="flex-1 text-sm leading-snug">{toast.message}</p>

            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 mt-0.5 text-white/50 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}

      {/* Keyframes injected inline for portability */}
      <style jsx global>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
