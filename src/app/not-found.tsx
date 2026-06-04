import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '404 — Page Not Found | Autokkeep',
  description: 'The page you are looking for does not exist.',
};

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-sans)',
      textAlign: 'center',
      padding: '24px',
    }}>
      <div style={{
        fontSize: '6rem',
        fontWeight: 900,
        background: 'var(--accent-gradient)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        lineHeight: 1,
        marginBottom: '16px',
      }}>
        404
      </div>
      <h1 style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        marginBottom: '12px',
      }}>
        This ledger entry doesn&apos;t exist
      </h1>
      <p style={{
        fontSize: '1rem',
        color: 'var(--text-secondary)',
        marginBottom: '32px',
        maxWidth: '400px',
      }}>
        The page you&apos;re looking for has been debited from our servers. Let&apos;s get you back to balanced books.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '10px',
            fontWeight: 600,
            fontSize: '0.9rem',
            textDecoration: 'none',
            background: 'var(--accent-gradient)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          Back to Home
        </Link>
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '10px',
            fontWeight: 600,
            fontSize: '0.9rem',
            textDecoration: 'none',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          View Dashboard
        </Link>
      </div>
    </div>
  );
}
