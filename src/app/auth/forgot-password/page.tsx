'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useState, FormEvent } from 'react';
import Logo from '@/components/ui/Logo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import styles from './page.module.css';

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
      <div className={styles.background} />
      <div className={styles.gridOverlay} />

      {/* Page container */}
      <div className={styles.page}>
        {/* Card */}
        <Card variant="elevated" padding="lg" className={styles.card}>
          {/* Logo */}
          <div className={styles.logoRow}>
            <Link href="/" className={styles.logoLink}>
              <Logo size={40} />
              <span className={styles.logoText}>Autokkeep</span>
            </Link>
          </div>

          {!submitted ? (
            <>
              {/* Lock Icon */}
              <div className={styles.iconBoxLock}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-accent-text)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>

              {/* Heading */}
              <h2 className={styles.heading}>Reset password</h2>
              <p className={styles.subtitle}>
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit}>
                <div className={styles.emailGroup}>
                  <Input
                    label="Email address"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    size="lg"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={loading}
                  className={styles.submitButton}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </form>
            </>
          ) : (
            /* Success state */
            <>
              {/* Checkmark Icon */}
              <div className={styles.iconBoxSuccess}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-success)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>

              <h2 className={styles.heading}>Check your email</h2>
              <p className={styles.successSubtitle}>
                We&apos;ve sent a password reset link to:
              </p>

              <p className={styles.emailDisplay}>{email}</p>

              <p className={styles.successHint}>
                Click the link in the email to reset your password. If you don&apos;t see it, check your spam folder.
              </p>

              <Button
                variant="secondary"
                size="lg"
                className={styles.tryAgainButton}
                onClick={() => {
                  setSubmitted(false);
                  setEmail('');
                }}
              >
                Try a different email
              </Button>
            </>
          )}

          {/* Divider */}
          <div className={styles.divider}>
            <div className={styles.dividerLine} />
          </div>

          {/* Back to login link */}
          <p className={styles.backToLoginRow}>
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
            <Link href="/auth/login" className={styles.backToLoginLink}>
              Back to Sign In
            </Link>
          </p>
        </Card>

        {/* Back to home link */}
        <Link href="/" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to home
        </Link>
      </div>

      {/* Error toast */}
      {error && (
        <div className={styles.errorToast}>
          <div className={styles.errorToastContent}>
            <svg
              className={styles.errorToastIcon}
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
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}
    </>
  );
}
