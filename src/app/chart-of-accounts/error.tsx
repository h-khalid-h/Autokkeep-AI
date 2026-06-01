'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ChartOfAccountsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ChartOfAccounts] Error:', error);
    import('@/lib/sentry').then(({ captureException }) => {
      captureException(error, {
        tags: { boundary: 'chart-of-accounts-error' },
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
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📒</div>
        <h2 className="text-h3" style={{ marginBottom: '8px' }}>
          Chart of Accounts couldn&apos;t load
        </h2>
        <p
          className="text-body"
          style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}
        >
          There was a problem loading your chart of accounts. Your account data is safe
          — please try again or return to the dashboard.
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
