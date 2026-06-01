'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useMemo, FormEvent } from 'react'
import Link from 'next/link'
import Logo from '@/components/ui/Logo'

function getPasswordStrength(password: string): { level: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: 'Weak', color: 'hsl(0, 72%, 55%)' };
  if (score === 2) return { level: 2, label: 'Fair', color: 'hsl(38, 92%, 50%)' };
  if (score === 3) return { level: 3, label: 'Good', color: 'hsl(217, 99%, 50%)' };
  return { level: 4, label: 'Strong', color: 'hsl(180, 100%, 50%)' };
}

export default function SignupPage() {
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const passwordRequirements = useMemo(() => [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Contains lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Contains a number', met: /[0-9]/.test(password) },
  ], [password])

  const allRequirementsMet = passwordRequirements.every((r) => r.met)
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const isFormValid = allRequirementsMet && passwordsMatch && !loading

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            org_name: orgName,
          },
        },
      })

      if (error) {
        setError(error.message)
      } else if (data.user?.identities?.length === 0) {
        // Supabase returns fake success for existing emails (prevents enumeration)
        // but identities will be empty — let the user know
        setError('An account with this email already exists. Please sign in instead.')
      } else {
        setConfirmed(true)
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      id="signup-page"
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
        id="signup-card"
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
          animation: 'fadeInUp 0.5s ease-out both',
        }}
      >
        {!confirmed ? (
          <>
            {/* Logo */}
            <div
              id="signup-logo"
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
              id="signup-heading"
              className="text-h2"
              style={{
                textAlign: 'center',
                marginBottom: 'var(--space-2)',
              }}
            >
              Create your account
            </h2>

            {/* Subtitle */}
            <p
              id="signup-subtitle"
              className="text-body"
              style={{
                textAlign: 'center',
                marginBottom: 'var(--space-8)',
              }}
            >
              Start understanding your finances
            </p>

            {/* Error toast */}
            {error && (
              <div
                id="signup-error-toast"
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
                  animation: 'fadeInUp 0.25s ease-out both',
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
            <form id="signup-form" onSubmit={handleSubmit}>
              {/* Organization Name */}
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <label
                  id="signup-org-label"
                  htmlFor="signup-org-input"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  Organization name
                </label>
                <input
                  id="signup-org-input"
                  className="input"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Inc."
                  required
                />
              </div>

              {/* Email */}
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <label
                  id="signup-email-label"
                  htmlFor="signup-email-input"
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
                  id="signup-email-input"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <label
                  id="signup-password-label"
                  htmlFor="signup-password-input"
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
                    id="signup-password-input"
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    style={{ paddingRight: '48px' }}
                  />
                  <button
                    id="signup-password-toggle"
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
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-tertiary)'
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
                {/* Password strength indicator */}
                {password.length > 0 && (
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <div style={{
                      display: 'flex',
                      gap: '4px',
                      marginBottom: '6px',
                    }}>
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          style={{
                            flex: 1,
                            height: '3px',
                            borderRadius: '2px',
                            background: level <= getPasswordStrength(password).level
                              ? getPasswordStrength(password).color
                              : 'var(--border-secondary)',
                            transition: 'background var(--duration-fast) var(--ease-out)',
                          }}
                        />
                      ))}
                    </div>
                    <span style={{
                      fontSize: '12px',
                      color: getPasswordStrength(password).color,
                    }}>
                      {getPasswordStrength(password).label}
                    </span>
                  </div>
                )}
                {/* Password requirements checklist */}
                {password.length > 0 && (
                  <ul
                    id="signup-password-requirements"
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 'var(--space-2) 0 0 0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {passwordRequirements.map((req) => (
                      <li
                        key={req.label}
                        style={{
                          fontSize: '0.75rem',
                          lineHeight: 1.5,
                          color: req.met ? 'var(--success)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'color var(--duration-fast) var(--ease-out)',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.75rem',
                            lineHeight: 1,
                            flexShrink: 0,
                            transition: 'color var(--duration-fast) var(--ease-out)',
                          }}
                        >
                          {req.met ? '✓' : '✗'}
                        </span>
                        {req.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <label
                  id="signup-confirm-password-label"
                  htmlFor="signup-confirm-password-input"
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
                    id="signup-confirm-password-input"
                    className="input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                    style={{ paddingRight: '48px' }}
                  />
                  <button
                    id="signup-confirm-password-toggle"
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
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-tertiary)'
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
                {/* Password match indicator */}
                {confirmPassword.length > 0 && (
                  <div
                    id="signup-password-match-indicator"
                    style={{
                      marginTop: 'var(--space-2)',
                      fontSize: '0.75rem',
                      lineHeight: 1.5,
                      color: passwordsMatch ? 'var(--success)' : 'var(--destructive)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'color var(--duration-fast) var(--ease-out)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.75rem',
                        lineHeight: 1,
                        flexShrink: 0,
                        transition: 'color var(--duration-fast) var(--ease-out)',
                      }}
                    >
                      {passwordsMatch ? '✓' : '✗'}
                    </span>
                    {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  </div>
                )}
              </div>

              {/* Submit button */}
              <button
                id="signup-submit-button"
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={!isFormValid}
                style={{
                  width: '100%',
                  cursor: !isFormValid ? 'not-allowed' : 'pointer',
                  opacity: !isFormValid ? 0.7 : 1,
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
                        animation: 'spin 1s linear infinite',
                      }}
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Creating account…
                  </span>
                ) : (
                  'Create Account'
                )}
              </button>

              <p style={{
                textAlign: 'center',
                marginTop: 'var(--space-3)',
                fontSize: '11px',
                color: 'var(--text-tertiary)',
                lineHeight: '1.5',
              }}>
                By creating an account, you agree to our{' '}
                <Link href="/terms" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>Privacy Policy</Link>.
              </p>
            </form>

            {/* Sign in link */}
            <p
              id="signup-signin-link"
              style={{
                textAlign: 'center',
                marginTop: 'var(--space-6)',
                fontSize: '14px',
                color: 'var(--text-tertiary)',
              }}
            >
              Already have an account?{' '}
              <Link
                href="/auth/login"
                style={{
                  color: 'var(--accent-primary)',
                  textDecoration: 'none',
                  fontWeight: 500,
                  transition: 'color var(--duration-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--accent-secondary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--accent-primary)'
                }}
              >
                Sign in
              </Link>
            </p>
          </>
        ) : (
          /* Confirmation card */
          <div
            id="signup-confirmation"
            style={{
              textAlign: 'center',
              animation: 'fadeInUp 0.4s ease-out both',
            }}
          >
            {/* Green checkmark icon */}
            <div
              id="signup-confirmation-icon"
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
              id="signup-confirmation-heading"
              className="text-h2"
              style={{
                marginBottom: 'var(--space-3)',
              }}
            >
              Check your email
            </h2>

            {/* Description */}
            <p
              id="signup-confirmation-text"
              className="text-body"
              style={{
                marginBottom: 'var(--space-8)',
                lineHeight: 1.6,
              }}
            >
              We sent a verification link to{' '}
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{email}</span>.
              Click the link to activate your account.
            </p>

            {/* Back to sign in link */}
            <Link
              id="signup-back-to-signin"
              href="/auth/login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--accent-primary)',
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: '15px',
                transition: 'color var(--duration-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--accent-secondary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--accent-primary)'
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
              Back to sign in
            </Link>
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
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes spin {
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
  )
}
