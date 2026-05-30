'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    import('@/lib/sentry').then(({ captureException }) => {
      captureException(error, {
        tags: { boundary: 'page-error' },
        extra: { digest: error.digest },
      });
    });
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        padding: '24px',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '420px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚠️</div>
        <h2
          className="text-h2"
          style={{ marginBottom: '8px' }}
        >
          Something went wrong
        </h2>
        <p
          className="text-body"
          style={{ marginBottom: '24px' }}
        >
          An unexpected error occurred. Please try again or contact support if the issue persists.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={reset}>
            Try Again
          </button>
          <a href="/" className="btn btn-ghost">
            Go Home
          </a>
        </div>
        {error.digest && (
          <p
            className="text-caption"
            style={{ marginTop: '16px' }}
          >
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
