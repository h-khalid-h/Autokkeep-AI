'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard] Error:', error);
    import('@/lib/sentry').then(({ captureException }) => {
      captureException(error, {
        tags: { boundary: 'dashboard-error' },
        extra: { digest: error.digest },
      });
    });
  }, [error]);

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div className="card-elevated" style={{ textAlign: 'center', maxWidth: '460px', padding: '48px 32px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📊</div>
        <h2 className="text-h3" style={{ marginBottom: '8px' }}>
          Dashboard couldn&apos;t load
        </h2>
        <p
          className="text-body"
          style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}
        >
          We hit a problem loading your dashboard data. This is usually temporary — try
          refreshing the page or click the button below.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={reset}>
            Try Again
          </button>
          <Link href="/dashboard" className="btn btn-ghost">
            Back to Dashboard
          </Link>
        </div>
        {error.digest && (
          <p className="text-caption" style={{ marginTop: '16px' }}>
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
