'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useState, FormEvent } from 'react';
import Logo from '@/components/ui/Logo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}/auth/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      setTimeout(() => setError(null), 4000);
      return;
    }

    setLoading(false);
    setSubmitted(true);
  };

  return (
    <>
      {/* Background */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: `
            radial-gradient(ellipse 60% 50% at 50% 40%, rgba(var(--accent-glow-rgb), 0.14) 0%, transparent 60%),
            radial-gradient(ellipse at 20% 50%, rgba(var(--accent-glow-rgb), 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(0, 245, 255, 0.06) 0%, transparent 50%)
          `,
          zIndex: 0,
        }}
      />

      {/* Grid pattern overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
          zIndex: 0,
        }}
      />

      {/* Page container */}
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
          padding: 'var(--space-6)',
        }}
      >
        {/* Glassmorphic Card */}
        <div
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-2xl)',
            padding: 'var(--space-12)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            maxWidth: '440px',
            width: '100%',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5), var(--shadow-glow)',
            animation: 'fpCardFadeIn 0.6s ease-out forwards',
            opacity: 0,
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-8)',
            }}
          >
            <Link
              href="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                textDecoration: 'none',
              }}
            >
              <Logo size={40} />
              <span
                className="text-gradient"
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                }}
              >
                Autokkeep
              </span>
            </Link>
          </div>

          {!submitted ? (
            <>
              {/* Lock Icon */}
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: 'var(--radius-xl)',
                  background: 'var(--accent-subtle)',
                  border: '1px solid var(--border-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 'var(--space-6)',
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>

              {/* Heading */}
              <h2
                className="text-h2"
                style={{ marginBottom: 'var(--space-2)' }}
              >
                Reset password
              </h2>

              {/* Subtitle */}
              <p
                className="text-body"
                style={{ marginBottom: 'var(--space-8)' }}
              >
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit}>
                {/* Email field */}
                <div style={{ marginBottom: 'var(--space-6)' }}>
                  <label
                    htmlFor="fp-email-input"
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    Email address
                  </label>
                  <input
                    id="fp-email-input"
                    className="input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                {/* Submit button */}
                <button
                  className="btn btn-primary btn-lg"
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    position: 'relative',
                  }}
                >
                  {loading && (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      style={{
                        animation: 'fpSpinner 0.8s linear infinite',
                      }}
                    >
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  )}
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            </>
          ) : (
            /* Success state */
            <>
              {/* Checkmark Icon */}
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: 'var(--radius-xl)',
                  background: 'var(--success-subtle)',
                  border: '1px solid var(--success-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 'var(--space-6)',
                  animation: 'fpCheckBounce 0.5s ease-out',
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>

              <h2
                className="text-h2"
                style={{ marginBottom: 'var(--space-2)' }}
              >
                Check your email
              </h2>

              <p
                className="text-body"
                style={{ marginBottom: 'var(--space-3)' }}
              >
                We&apos;ve sent a password reset link to:
              </p>

              <p
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-6)',
                  wordBreak: 'break-all',
                }}
              >
                {email}
              </p>

              <p
                className="text-body"
                style={{ marginBottom: 'var(--space-8)', fontSize: '14px' }}
              >
                Click the link in the email to reset your password. If you don&apos;t see it, check your spam folder.
              </p>

              <button
                className="btn btn-secondary btn-lg"
                onClick={() => {
                  setSubmitted(false);
                  setEmail('');
                }}
                style={{ width: '100%', marginBottom: 'var(--space-4)' }}
              >
                Try a different email
              </button>
            </>
          )}

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              margin: 'var(--space-6) 0',
            }}
          >
            <div
              style={{
                flex: 1,
                height: '1px',
                background: 'var(--border-secondary)',
              }}
            />
          </div>

          {/* Back to login link */}
          <p
            style={{
              textAlign: 'center',
              fontSize: '14px',
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <Link
              href="/auth/login"
              style={{
                color: 'var(--accent-primary)',
                textDecoration: 'none',
                fontWeight: 500,
                transition: 'color var(--duration-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
            >
              Back to Sign In
            </Link>
          </p>
        </div>

        {/* Back to home link */}
        <Link
          href="/"
          style={{
            marginTop: 'var(--space-6)',
            fontSize: '13px',
            color: 'var(--text-tertiary)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'color var(--duration-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to home
        </Link>
      </div>

      {/* Error toast */}
      {error && (
        <div
          className="toast toast-error"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            animation: 'fpToastIn 0.3s ease-out forwards',
          }}
        >
          <div
            className="toast-content"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes fpCardFadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fpSpinner {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes fpToastIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes fpCheckBounce {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          60% {
            transform: scale(1.1);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </>
  );
}
