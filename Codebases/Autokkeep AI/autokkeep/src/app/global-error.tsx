'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry
    import('@/lib/sentry').then(({ captureException }) => {
      captureException(error, {
        tags: { boundary: 'global-error' },
        extra: { digest: error.digest },
      });
    });
  }, [error]);

  return (
    <html>
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'hsl(222, 47%, 6%)',
          color: 'hsl(0, 0%, 95%)',
          fontFamily: 'Inter, -apple-system, sans-serif',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>
            Something went wrong
          </h2>
          <p
            style={{
              color: 'hsl(222, 15%, 65%)',
              fontSize: '0.9375rem',
              lineHeight: 1.6,
              marginBottom: '24px',
            }}
          >
            An unexpected error occurred. Our team has been notified and is investigating.
          </p>
          <button
            onClick={reset}
            style={{
              background: 'linear-gradient(135deg, hsl(234, 89%, 64%), hsl(270, 80%, 65%))',
              color: 'white',
              border: 'none',
              padding: '12px 32px',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
