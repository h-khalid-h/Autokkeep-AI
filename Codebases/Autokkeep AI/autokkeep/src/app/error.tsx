'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
          {error.message || 'An unexpected error occurred. Our team has been notified.'}
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
