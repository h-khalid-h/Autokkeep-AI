'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, FormEvent } from 'react';
import Logo from '@/components/ui/Logo';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/auth/login');
      }, 2000);
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div
      id="reset-password-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        position: 'relative',
        overflow: 'hidden',
        padding: 'var(--space-6)',
      }}
    >
      {/* Background radial gradients */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(var(--accent-glow-rgb), 0.14) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(0, 245, 255, 0.06) 0%, transparent 50%), radial-gradient(ellipse 50% 40% at 10% 60%, rgba(var(--accent-glow-rgb), 0.06) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Grid pattern overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
          pointerEvents: 'none',
        }}
      />

      {/* Glassmorphic card */}
      <div
        id="reset-password-card"
        style={{
          position: 'relative',
          background: 'var(--bg-glass)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-2xl)',
          padding: 'var(--space-12)',
          maxWidth: '440px',
          width: '100%',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5), var(--shadow-glow)',
          animation: 'resetFadeInUp 0.5s ease-out both',
        }}
      >
        {!success ? (
          <>
            {/* Logo */}
            <div
              id="reset-password-logo"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-8)',
              }}
            >
              <Logo size={40} />
              <span
                className="text-gradient"
                style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  letterSpacing: '-0.3px',
                }}
              >
                Autokkeep
              </span>
            </div>

            {/* Heading */}
            <h2
              id="reset-password-heading"
              className="text-h2"
              style={{
                textAlign: 'center',
                marginBottom: 'var(--space-2)',
              }}
            >
              Set new password
            </h2>

            {/* Subtitle */}
            <p
              id="reset-password-subtitle"
              className="text-body"
              style={{
                textAlign: 'center',
                marginBottom: 'var(--space-8)',
              }}
            >
              Enter your new password below
            </p>

            {/* Error toast */}
            {error && (
              <div
                id="reset-password-error-toast"
                style={{
                  background: 'var(--destructive-subtle)',
                  border: '1px solid var(--destructive-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-3) var(--space-4)',
                  marginBottom: 'var(--space-6)',
                  color: '#fca5a5',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  animation: 'resetFadeInUp 0.25s ease-out both',
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
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            {/* Form */}
            <form id="reset-password-form" onSubmit={handleSubmit}>
              {/* Password */}
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <label
                  id="reset-password-label"
                  htmlFor="reset-password-input"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  New password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-password-input"
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    autoComplete="new-password"
                    style={{ paddingRight: '48px' }}
                  />
                  <button
                    id="reset-password-toggle"
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
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-tertiary)';
                    }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <label
                  id="reset-confirm-password-label"
                  htmlFor="reset-confirm-password-input"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  Confirm password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-confirm-password-input"
                    className="input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                    autoComplete="new-password"
                    style={{ paddingRight: '48px' }}
                  />
                  <button
                    id="reset-confirm-password-toggle"
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-tertiary)';
                    }}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Submit button */}
              <button
                id="reset-password-submit-button"
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading}
                style={{
                  width: '100%',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  transition: 'opacity var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out)',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {loading ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{
                        animation: 'resetSpin 1s linear infinite',
                      }}
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Updating password…
                  </span>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>

            {/* Back to sign in link */}
            <p
              id="reset-password-signin-link"
              style={{
                textAlign: 'center',
                marginTop: 'var(--space-6)',
                fontSize: '14px',
                color: 'var(--text-tertiary)',
              }}
            >
              Remember your password?{' '}
              <Link
                href="/auth/login"
                style={{
                  color: 'var(--accent-primary)',
                  textDecoration: 'none',
                  fontWeight: 500,
                  transition: 'color var(--duration-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--accent-secondary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--accent-primary)';
                }}
              >
                Sign in
              </Link>
            </p>
          </>
        ) : (
          /* Success confirmation */
          <div
            id="reset-password-success"
            style={{
              textAlign: 'center',
              animation: 'resetFadeInUp 0.4s ease-out both',
            }}
          >
            {/* Green checkmark icon */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--success-subtle)',
                border: '2px solid var(--success-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-6)',
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--success)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            {/* Heading */}
            <h2
              className="text-h2"
              style={{
                marginBottom: 'var(--space-3)',
              }}
            >
              Password updated
            </h2>

            {/* Description */}
            <p
              className="text-body"
              style={{
                marginBottom: 'var(--space-8)',
                lineHeight: 1.6,
              }}
            >
              Your password has been successfully reset. Redirecting you to sign in…
            </p>
          </div>
        )}
      </div>

      {/* Back to home link */}
      <Link
        href="/"
        style={{
          position: 'relative',
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

      {/* Global keyframe animations */}
      <style>{`
        @keyframes resetFadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes resetSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        input::placeholder {
          color: rgba(255, 255, 255, 0.25);
        }
      `}</style>
    </div>
  );
}
