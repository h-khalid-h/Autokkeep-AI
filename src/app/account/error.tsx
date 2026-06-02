'use client';

import { useEffect } from 'react';
import AppShell from '@/components/layout/AppShell';
import styles from '../shared-error.module.css';

export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    import('@/lib/sentry').then(({ captureException }) => {
      captureException(error);
    }).catch(() => { /* Sentry not available */ });
    console.error('[Account Error]', error);
  }, [error]);

  return (
    <AppShell>
      <div className={styles.routeErrorPage}>
        <div className={styles.errorIcon}>⚠️</div>
        <h2 className={styles.errorTitle}>Something went wrong</h2>
        <p className={styles.errorMessage}>
          {error.message || 'An unexpected error occurred loading this page.'}
        </p>
        <div className={styles.errorActions}>
          <button className={styles.retryBtn} onClick={reset}>
            Try again
          </button>
          <a href="/dashboard" className={styles.homeLink}>
            ← Back to Dashboard
          </a>
        </div>
      </div>
    </AppShell>
  );
}
