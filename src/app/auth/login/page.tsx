'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, FormEvent, Suspense } from 'react';
import Logo from '@/components/ui/Logo';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError === 'auth_callback_error' ? 'Authentication failed. Please try again.' : null
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      setTimeout(() => setError(null), 4000);
      return;
    }

    // Check for stored redirect from AuthGuard
    const storedRedirect = typeof window !== 'undefined'
      ? sessionStorage.getItem('autokkeep_redirect')
      : null;
    if (storedRedirect) {
      sessionStorage.removeItem('autokkeep_redirect');
    }

    // Validate redirect to prevent open redirect attacks
    const isSafeRedirect = (url: string | null): boolean =>
      !!url && url.startsWith('/') && !url.startsWith('//');

    const target = isSafeRedirect(storedRedirect) ? storedRedirect!
      : isSafeRedirect(redirect) ? redirect!
      : '/dashboard';
    router.push(target);
  };

  return (
    <>
      {/* Background */}
      <div
        id="login-background"
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
        id="login-grid-overlay"
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
        id="login-page"
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
          id="login-card"
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
            animation: 'loginCardFadeIn 0.6s ease-out forwards',
            opacity: 0,
          }}
        >
          {/* Logo */}
          <div
            id="login-logo-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-8)',
            }}
          >
            <Logo size={40} />
            <span
              id="login-logo-text"
              className="text-gradient"
              style={{
                fontSize: '20px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              Autokkeep
            </span>
          </div>

          {/* Heading */}
          <h2
            id="login-heading"
            className="text-h2"
            style={{ marginBottom: 'var(--space-2)' }}
          >
            Welcome back
          </h2>

          {/* Subtitle */}
          <p
            id="login-subtitle"
            className="text-body"
            style={{ marginBottom: 'var(--space-8)' }}
          >
            Sign in to your account
          </p>

          {/* Form */}
          <form id="login-form" onSubmit={handleSubmit}>
            {/* Email field */}
            <div id="login-email-group" style={{ marginBottom: 'var(--space-5)' }}>
              <label
                id="login-email-label"
                htmlFor="login-email-input"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                Email
              </label>
              <input
                id="login-email-input"
                className="input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {/* Password field */}
            <div id="login-password-group" style={{ marginBottom: 'var(--space-3)' }}>
              <label
                id="login-password-label"
                htmlFor="login-password-input"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password-input"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: '48px' }}
                />
                <button
                  id="login-toggle-password"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-tertiary)',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'color var(--duration-fast) var(--ease-out)',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = 'var(--text-secondary)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = 'var(--text-tertiary)')
                  }
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Forgot password link */}
            <div
              id="login-forgot-row"
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: 'var(--space-6)',
              }}
            >
              <Link
                id="login-forgot-link"
                href="/auth/forgot-password"
                style={{
                  fontSize: '13px',
                  color: 'var(--accent-primary)',
                  textDecoration: 'none',
                  transition: 'color var(--duration-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-secondary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit button */}
            <button
              id="login-submit-btn"
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
                  id="login-spinner"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  style={{
                    animation: 'loginSpinner 0.8s linear infinite',
                  }}
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              )}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div
            id="login-divider"
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
            <span
              id="login-divider-text"
              style={{
                fontSize: '13px',
                color: 'var(--text-tertiary)',
                textTransform: 'lowercase',
              }}
            >
              or
            </span>
            <div
              style={{
                flex: 1,
                height: '1px',
                background: 'var(--border-secondary)',
              }}
            />
          </div>

          {/* Sign up link */}
          <p
            id="login-signup-row"
            style={{
              textAlign: 'center',
              fontSize: '14px',
              color: 'var(--text-tertiary)',
            }}
          >
            Don&apos;t have an account?{' '}
            <Link
              id="login-signup-link"
              href="/auth/signup"
              style={{
                color: 'var(--accent-primary)',
                textDecoration: 'none',
                fontWeight: 500,
                transition: 'color var(--duration-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
            >
              Sign up
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
          id="login-error-toast"
          className="toast toast-error"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            animation: 'loginToastIn 0.3s ease-out forwards',
          }}
        >
          <div
            id="login-error-toast-content"
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
            <span id="login-error-toast-message">{error}</span>
          </div>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes loginCardFadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes loginSpinner {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes loginToastIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
