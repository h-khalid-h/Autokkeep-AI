'use client';

import styles from '../shared-error.module.css';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.errorPage}>
      <div className={styles.errorIcon}>⚠️</div>
      <h2 className={styles.errorTitle}>Something went wrong</h2>
      <p className={styles.errorMessage}>{error.message}</p>
      <button className={styles.retryBtn} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
