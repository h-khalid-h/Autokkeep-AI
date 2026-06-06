'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
      <h2>Something went wrong</h2>
      <p style={{ color: 'var(--color-text-secondary)' }}>{error.message}</p>
      <button
        onClick={reset}
        style={{
          marginTop: 'var(--space-4)',
          padding: 'var(--space-2) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-brand)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
