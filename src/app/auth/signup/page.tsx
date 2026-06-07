'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useMemo, FormEvent } from 'react'
import Link from 'next/link'
import Logo from '@/components/ui/Logo'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import styles from './page.module.css'

function getPasswordStrength(password: string): { level: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: 'Weak', color: 'var(--color-destructive)' };
  if (score === 2) return { level: 2, label: 'Fair', color: 'var(--color-warning)' };
  if (score === 3) return { level: 3, label: 'Good', color: 'var(--color-accent)' };
  return { level: 4, label: 'Strong', color: 'var(--color-success)' };
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
        setError('An account with this email already exists. Please sign in instead.')
      } else {
        setConfirmed(true)
      }
    } catch (err) {
      console.error('[Signup] Error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const strength = getPasswordStrength(password)

  return (
    <div id="signup-page" className={styles.page}>
      {/* Background decorations */}
      <div className={styles.bgGradient} />
      <div className={styles.bgGrid} />

      {/* Card */}
      <Card variant="elevated" padding="lg" className={styles.card}>
        {!confirmed ? (
          <>
            {/* Logo */}
            <div id="signup-logo" className={styles.logoRow}>
              <Logo size={40} />
              <span className={styles.logoText}>Autokkeep</span>
            </div>

            {/* Heading */}
            <h2 id="signup-heading" className={styles.heading}>
              Create your account
            </h2>

            {/* Subtitle */}
            <p id="signup-subtitle" className={styles.subtitle}>
              Start understanding your finances
            </p>

            {/* Error toast */}
            {error && (
              <div id="signup-error-toast" className={styles.errorToast}>
                <svg
                  className={styles.errorIcon}
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
              <div className={styles.fieldGroup}>
                <Input
                  id="signup-org-input"
                  label="Organization name"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Inc."
                  required
                  autoComplete="organization"
                  size="lg"
                />
              </div>

              {/* Email */}
              <div className={styles.fieldGroup}>
                <Input
                  id="signup-email-input"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  size="lg"
                />
              </div>

              {/* Password */}
              <div className={styles.fieldGroup}>
                <div className={styles.passwordWrapper}>
                  <Input
                    id="signup-password-input"
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    autoComplete="new-password"
                    size="lg"
                  />
                  <button
                    id="signup-password-toggle"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={styles.passwordToggle}
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
                  <div className={styles.strengthContainer}>
                    <div className={styles.strengthBars}>
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={styles.strengthBar}
                          style={{
                            background: level <= strength.level ? strength.color : undefined,
                          }}
                        />
                      ))}
                    </div>
                    <span
                      className={styles.strengthLabel}
                      style={{ color: strength.color }}
                    >
                      {strength.label}
                    </span>
                  </div>
                )}

                {/* Password requirements checklist */}
                {password.length > 0 && (
                  <ul id="signup-password-requirements" className={styles.requirementsList}>
                    {passwordRequirements.map((req) => (
                      <li
                        key={req.label}
                        className={`${styles.requirementItem} ${req.met ? styles.requirementMet : styles.requirementUnmet}`}
                      >
                        <span className={styles.requirementIcon}>
                          {req.met ? '✓' : '✗'}
                        </span>
                        {req.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Confirm Password */}
              <div className={styles.fieldGroupLast}>
                <div className={styles.passwordWrapper}>
                  <Input
                    id="signup-confirm-password-input"
                    label="Confirm password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                    autoComplete="new-password"
                    size="lg"
                  />
                  <button
                    id="signup-confirm-password-toggle"
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className={styles.passwordToggle}
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
                    className={`${styles.matchIndicator} ${passwordsMatch ? styles.matchSuccess : styles.matchError}`}
                  >
                    <span className={styles.matchIcon}>
                      {passwordsMatch ? '✓' : '✗'}
                    </span>
                    {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  </div>
                )}
              </div>

              {/* Submit button */}
              <Button
                id="signup-submit-button"
                type="submit"
                variant="primary"
                size="lg"
                isLoading={loading}
                disabled={!isFormValid}
                className={styles.submitButton}
              >
                {loading ? 'Creating account…' : 'Create Account'}
              </Button>

              <p className={styles.termsText}>
                By creating an account, you agree to our{' '}
                <Link href="/terms" className={styles.termsLink}>Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy" className={styles.termsLink}>Privacy Policy</Link>.
              </p>
            </form>

            {/* Sign in link */}
            <p id="signup-signin-link" className={styles.signinRow}>
              Already have an account?{' '}
              <Link href="/auth/login" className={styles.signinLink}>
                Sign in
              </Link>
            </p>
          </>
        ) : (
          /* Confirmation card */
          <div id="signup-confirmation" className={styles.confirmation}>
            {/* Green checkmark icon */}
            <div id="signup-confirmation-icon" className={styles.confirmIcon}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-success)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            {/* Heading */}
            <h2 id="signup-confirmation-heading" className={styles.confirmHeading}>
              Check your email
            </h2>

            {/* Description */}
            <p id="signup-confirmation-text" className={styles.confirmText}>
              We sent a verification link to{' '}
              <span className={styles.confirmEmail}>{email}</span>.
              Click the link to activate your account.
            </p>

            {/* Back to sign in link */}
            <Link
              id="signup-back-to-signin"
              href="/auth/login"
              className={styles.backToSignin}
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
      </Card>

      {/* Back to home link */}
      <Link href="/" className={styles.backToHome}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to home
      </Link>
    </div>
  )
}
