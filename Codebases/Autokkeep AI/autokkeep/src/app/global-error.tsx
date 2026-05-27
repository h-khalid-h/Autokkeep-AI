'use client';

/**
 * Global error boundary — catches errors in the root layout itself.
 * Unlike error.tsx, this handles errors that occur in layout.tsx.
 * Must include its own <html> and <body> tags since the root layout
 * may have failed to render.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0B0F',
          color: '#fff',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '480px', padding: '24px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #B3F847, #8BC34A)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: '24px',
              fontWeight: 700,
            }}
          >
            AK
          </div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: '12px',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: '0.9375rem',
              color: 'rgba(255, 255, 255, 0.6)',
              marginBottom: '8px',
              lineHeight: 1.6,
            }}
          >
            {error.message || 'An unexpected error occurred. Please try refreshing the page.'}
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.3)',
                marginBottom: '24px',
                fontFamily: 'monospace',
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{
                padding: '10px 24px',
                background: 'linear-gradient(135deg, #B3F847, #8BC34A)',
                border: 'none',
                borderRadius: '10px',
                color: '#000',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{
                padding: '10px 24px',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                color: 'rgba(255, 255, 255, 0.7)',
                fontWeight: 500,
                fontSize: '0.875rem',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Go Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
