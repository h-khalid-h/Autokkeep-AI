'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useState, FormEvent } from 'react';

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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
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
            radial-gradient(ellipse at 20% 50%, rgba(91, 95, 230, 0.12) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(139, 92, 246, 0.08) 0%, transparent 50%)
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
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
          padding: '24px',
        }}
      >
        {/* Glassmorphic Card */}
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '20px',
            padding: '48px',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            maxWidth: '440px',
            width: '100%',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            animation: 'fpCardFadeIn 0.6s ease-out forwards',
            opacity: 0,
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '32px',
            }}
          >
            <Link
              href="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                textDecoration: 'none',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: 'var(--accent-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '16px',
                  letterSpacing: '-0.02em',
                  flexShrink: 0,
                }}
              >
                AK
              </div>
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
                  borderRadius: '16px',
                  background: 'var(--accent-subtle)',
                  border: '1px solid var(--border-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '24px',
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
                style={{ marginBottom: '8px' }}
              >
                Reset password
              </h2>

              {/* Subtitle */}
              <p
                className="text-body"
                style={{ marginBottom: '32px' }}
              >
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit}>
                {/* Email field */}
                <div style={{ marginBottom: '24px' }}>
                  <label
                    htmlFor="fp-email-input"
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'rgba(255,255,255,0.7)',
                      marginBottom: '8px',
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
                  borderRadius: '16px',
                  background: 'var(--success-subtle)',
                  border: '1px solid var(--success-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '24px',
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
                style={{ marginBottom: '8px' }}
              >
                Check your email
              </h2>

              <p
                className="text-body"
                style={{ marginBottom: '12px' }}
              >
                We&apos;ve sent a password reset link to:
              </p>

              <p
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  padding: '12px 16px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                  marginBottom: '24px',
                  wordBreak: 'break-all',
                }}
              >
                {email}
              </p>

              <p
                className="text-body"
                style={{ marginBottom: '32px', fontSize: '14px' }}
              >
                Click the link in the email to reset your password. If you don&apos;t see it, check your spam folder.
              </p>

              <button
                className="btn btn-secondary btn-lg"
                onClick={() => {
                  setSubmitted(false);
                  setEmail('');
                }}
                style={{ width: '100%', marginBottom: '16px' }}
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
              gap: '16px',
              margin: '28px 0',
            }}
          >
            <div
              style={{
                flex: 1,
                height: '1px',
                background: 'rgba(255,255,255,0.08)',
              }}
            />
          </div>

          {/* Back to login link */}
          <p
            style={{
              textAlign: 'center',
              fontSize: '14px',
              color: 'rgba(255,255,255,0.5)',
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
                transition: 'opacity 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Back to Sign In
            </Link>
          </p>
        </div>
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
