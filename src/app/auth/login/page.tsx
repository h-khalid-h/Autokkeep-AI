'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, FormEvent, Suspense } from 'react';
import Logo from '@/components/ui/Logo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import styles from './page.module.css';

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
      <div className={styles.background} />
      <div className={styles.gridOverlay} />

      {/* Page container */}
      <div className={styles.page}>
        {/* Card */}
        <Card variant="elevated" padding="lg" className={styles.card}>
          {/* Logo */}
          <div className={styles.logoRow}>
            <Logo size={40} />
            <span className={styles.logoText}>Autokkeep</span>
          </div>

          {/* Heading */}
          <h2 className={styles.heading}>Welcome back</h2>
          <p className={styles.subtitle}>Sign in to your account</p>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Email field */}
            <div className={styles.emailGroup}>
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                size="lg"
              />
            </div>

            {/* Password field */}
            <div className={styles.passwordGroup}>
              <div className={styles.passwordWrapper}>
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  size="lg"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword(!showPassword)}
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
            <div className={styles.forgotRow}>
              <Link href="/auth/forgot-password" className={styles.forgotLink}>
                Forgot password?
              </Link>
            </div>

            {/* Submit button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={loading}
              className={styles.submitButton}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Divider */}
          <div className={styles.divider}>
            <div className={styles.dividerLine} />
            <span className={styles.dividerText}>or</span>
            <div className={styles.dividerLine} />
          </div>

          {/* Sign up link */}
          <p className={styles.signupRow}>
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className={styles.signupLink}>
              Sign up
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
