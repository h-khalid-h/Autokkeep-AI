'use client';

import { useEffect } from 'react';
import styles from '../../shared-error.module.css';

export default function RouteError({
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
    console.error('[Route Error]', error);
  }, [error]);

  return (
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
        <a href="/" className={styles.homeLink}>
          ← Back to Home
        </a>
      </div>
    </div>
  );
}
