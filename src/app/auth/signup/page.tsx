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

  if (score <= 1) return { level: 1, label: 'Weak', color: '#ef4444' };
  if (score === 2) return { level: 2, label: 'Fair', color: '#f59e0b' };
  if (score === 3) return { level: 3, label: 'Good', color: '#3b82f6' };
  return { level: 4, label: 'Strong', color: '#10b981' };
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
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        position: 'relative',
        overflow: 'hidden',
        padding: '24px',
      }}
    >
      {/* Background radial gradients */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(30, 111, 255, 0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(36, 215, 210, 0.08) 0%, transparent 50%), radial-gradient(ellipse 50% 40% at 10% 60%, rgba(30, 111, 255, 0.06) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Glassmorphic card */}
      <div
        id="signup-card"
        style={{
          position: 'relative',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '20px',
          padding: '48px',
          maxWidth: '440px',
          width: '100%',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
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
                gap: '12px',
                marginBottom: '32px',
              }}
            >
              <Logo size={40} />
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  color: '#f0f0f5',
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
                color: '#f0f0f5',
                marginBottom: '8px',
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
                color: 'rgba(255,255,255,0.5)',
                marginBottom: '32px',
              }}
            >
              Start understanding your finances
            </p>

            {/* Error toast */}
            {error && (
              <div
                id="signup-error-toast"
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginBottom: '24px',
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
              <div style={{ marginBottom: '20px' }}>
                <label
                  id="signup-org-label"
                  htmlFor="signup-org-input"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.7)',
                    marginBottom: '8px',
                  }}
                >
                  Organization name
                </label>
                <input
                  id="signup-org-input"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Inc."
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    color: '#f0f0f5',
                    fontSize: '15px',
                    outline: 'none',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Email */}
              <div style={{ marginBottom: '20px' }}>
                <label
                  id="signup-email-label"
                  htmlFor="signup-email-input"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.7)',
                    marginBottom: '8px',
                  }}
                >
                  Email
                </label>
                <input
                  id="signup-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    color: '#f0f0f5',
                    fontSize: '15px',
                    outline: 'none',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: '20px' }}>
                <label
                  id="signup-password-label"
                  htmlFor="signup-password-input"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.7)',
                    marginBottom: '8px',
                  }}
                >
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="signup-password-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    style={{
                      width: '100%',
                      padding: '12px 48px 12px 16px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      color: '#f0f0f5',
                      fontSize: '15px',
                      outline: 'none',
                      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
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
                      color: 'rgba(255,255,255,0.4)',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
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
                  <div style={{ marginTop: '8px' }}>
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
                              : 'rgba(255,255,255,0.08)',
                            transition: 'background 0.2s ease',
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
                      margin: '8px 0 0 0',
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
                          color: req.met ? 'var(--status-success)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'color 0.2s ease',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.75rem',
                            lineHeight: 1,
                            flexShrink: 0,
                            transition: 'color 0.2s ease',
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
              <div style={{ marginBottom: '28px' }}>
                <label
                  id="signup-confirm-password-label"
                  htmlFor="signup-confirm-password-input"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.7)',
                    marginBottom: '8px',
                  }}
                >
                  Confirm password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="signup-confirm-password-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                    style={{
                      width: '100%',
                      padding: '12px 48px 12px 16px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      color: '#f0f0f5',
                      fontSize: '15px',
                      outline: 'none',
                      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
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
                      color: 'rgba(255,255,255,0.4)',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
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
                      marginTop: '8px',
                      fontSize: '0.75rem',
                      lineHeight: 1.5,
                      color: passwordsMatch ? 'var(--status-success)' : 'var(--status-danger)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'color 0.2s ease',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.75rem',
                        lineHeight: 1,
                        flexShrink: 0,
                        transition: 'color 0.2s ease',
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
                  padding: '14px',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: !isFormValid ? 'not-allowed' : 'pointer',
                  opacity: !isFormValid ? 0.7 : 1,
                  transition: 'opacity 0.2s ease, transform 0.15s ease',
                  position: 'relative',
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
                marginTop: '12px',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.35)',
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
                marginTop: '24px',
                fontSize: '14px',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              Already have an account?{' '}
              <Link
                href="/auth/login"
                style={{
                  color: 'var(--accent-primary)',
                  textDecoration: 'none',
                  fontWeight: 500,
                  transition: 'color 0.2s ease',
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
                background: 'rgba(16, 185, 129, 0.15)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#10b981"
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
                color: '#f0f0f5',
                marginBottom: '12px',
              }}
            >
              Check your email
            </h2>

            {/* Description */}
            <p
              id="signup-confirmation-text"
              className="text-body"
              style={{
                color: 'rgba(255,255,255,0.5)',
                marginBottom: '32px',
                lineHeight: 1.6,
              }}
            >
              We sent a verification link to{' '}
              <span style={{ color: '#f0f0f5', fontWeight: 500 }}>{email}</span>.
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
                transition: 'color 0.2s ease',
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
