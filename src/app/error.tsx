'use client';

import { useEffect } from 'react';
import styles from './shared-error.module.css';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry via lazy import (mirrors global-error.tsx pattern)
    import('@/lib/sentry').then(({ captureException }) => {
      captureException(error);
    }).catch(() => { /* Sentry not available */ });
    console.error('[Error Boundary]', error);
  }, [error]);

  return (
    <div className={styles.errorPage}>
      <div className={styles.errorIcon}>⚠️</div>
      <h2 className={styles.errorTitle}>Something went wrong</h2>
      <p className={styles.errorMessage}>
        {error.message || 'An unexpected error occurred.'}
      </p>
      {error.digest && (
        <p className={styles.errorDigest}>Error ID: {error.digest}</p>
      )}
      <div className={styles.errorActions}>
        <button className={styles.retryBtn} onClick={reset}>
          Try again
        </button>
        <a href="/dashboard" className={styles.homeLink}>
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}
