'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import Logo from '@/components/ui/Logo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

// Map Supabase error codes to user-friendly messages
interface ErrorInfo {
  title: string;
  description: string;
  icon: 'expired' | 'denied' | 'invalid' | 'generic';
  primaryAction: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
}

function getErrorInfo(errorCode: string | null, errorDescription: string | null): ErrorInfo {
  const decoded = errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, ' ')) : '';

  switch (errorCode) {
    case 'otp_expired':
      return {
        title: 'Link Expired',
        description: 'This email link has expired or has already been used. Please request a new one.',
        icon: 'expired',
        primaryAction: { label: 'Back to Login', href: '/auth/login' },
        secondaryAction: { label: 'Resend Confirmation', href: '/auth/signup' },
      };

    case 'otp_disabled':
      return {
        title: 'Link Disabled',
        description: 'Email link authentication is currently disabled. Please sign in with your password.',
        icon: 'denied',
        primaryAction: { label: 'Sign In', href: '/auth/login' },
      };

    case 'validation_failed':
      return {
        title: 'Validation Failed',
        description: decoded || 'The request could not be validated. Please try again.',
        icon: 'invalid',
        primaryAction: { label: 'Back to Login', href: '/auth/login' },
      };

    case 'user_banned':
      return {
        title: 'Account Suspended',
        description: 'Your account has been suspended. Please contact support for assistance.',
        icon: 'denied',
        primaryAction: { label: 'Contact Support', href: '/#contact' },
      };

    case 'user_not_found':
      return {
        title: 'Account Not Found',
        description: 'No account was found with this email address. Please sign up first.',
        icon: 'invalid',
        primaryAction: { label: 'Sign Up', href: '/auth/signup' },
        secondaryAction: { label: 'Sign In', href: '/auth/login' },
      };

    case 'email_not_confirmed':
      return {
        title: 'Email Not Confirmed',
        description: 'Please check your inbox and click the confirmation link before signing in.',
        icon: 'expired',
        primaryAction: { label: 'Back to Login', href: '/auth/login' },
      };

    case 'invalid_credentials':
      return {
        title: 'Invalid Credentials',
        description: 'The email or password you entered is incorrect. Please try again.',
        icon: 'denied',
        primaryAction: { label: 'Try Again', href: '/auth/login' },
        secondaryAction: { label: 'Reset Password', href: '/auth/forgot-password' },
      };

    case 'flow_state_expired':
    case 'flow_state_not_found':
      return {
        title: 'Session Expired',
        description: 'Your authentication session has expired. Please start the process again.',
        icon: 'expired',
        primaryAction: { label: 'Back to Login', href: '/auth/login' },
      };

    case 'provider_disabled':
      return {
        title: 'Provider Unavailable',
        description: 'This sign-in method is currently unavailable. Please use email and password.',
        icon: 'denied',
        primaryAction: { label: 'Sign In', href: '/auth/login' },
      };

    case 'same_password':
      return {
        title: 'Same Password',
        description: 'Your new password must be different from your current password.',
        icon: 'invalid',
        primaryAction: { label: 'Reset Password', href: '/auth/forgot-password' },
      };

    case 'auth_callback_error':
      return {
        title: 'Authentication Failed',
        description: 'Something went wrong during authentication. Please try signing in again.',
        icon: 'generic',
        primaryAction: { label: 'Try Again', href: '/auth/login' },
      };

    default: {
      // Handle access_denied with description
      if (decoded.toLowerCase().includes('expired')) {
        return {
          title: 'Link Expired',
          description: decoded || 'This link has expired. Please request a new one.',
          icon: 'expired',
          primaryAction: { label: 'Back to Login', href: '/auth/login' },
          secondaryAction: { label: 'Resend Confirmation', href: '/auth/signup' },
        };
      }
      return {
        title: 'Authentication Error',
        description: decoded || 'An unexpected authentication error occurred. Please try again.',
        icon: 'generic',
        primaryAction: { label: 'Back to Login', href: '/auth/login' },
        secondaryAction: { label: 'Back to Home', href: '/' },
      };
    }
  }
}

const ErrorIcons = {
  expired: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  denied: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  ),
  invalid: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  generic: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get('error_code') || searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const info = getErrorInfo(errorCode, errorDescription);

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

          {/* Error icon */}
          <div className={styles.errorIconWrapper}>
            <div className={styles.errorIcon}>
              {ErrorIcons[info.icon]}
            </div>
          </div>

          {/* Title */}
          <h1 className={styles.heading}>{info.title}</h1>

          {/* Description */}
          <p className={styles.description}>{info.description}</p>

          {/* Error code badge */}
          {errorCode && (
            <div className={styles.errorCode}>
              {errorCode}
            </div>
          )}

          {/* Actions */}
          <div className={styles.actions}>
            <Link href={info.primaryAction.href}>
              <Button variant="primary" size="lg" className={styles.primaryAction}>
                {info.primaryAction.label}
              </Button>
            </Link>
            {info.secondaryAction && (
              <div className={styles.secondaryActions}>
                <Link href={info.secondaryAction.href}>
                  <Button variant="ghost" size="md">
                    {info.secondaryAction.label}
                  </Button>
                </Link>
              </div>
            )}
          </div>
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
    </>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorContent />
    </Suspense>
  );
}
