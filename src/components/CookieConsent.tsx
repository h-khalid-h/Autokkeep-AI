'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './CookieConsent.module.css';

interface ConsentData {
  level: 'all' | 'essential';
  expires: string;
}

const CONSENT_KEY = 'cookie-consent';
const CONSENT_EXPIRY_DAYS = 365;

function setConsent(level: ConsentData['level']) {
  const expires = new Date();
  expires.setDate(expires.getDate() + CONSENT_EXPIRY_DAYS);
  const data: ConsentData = { level, expires: expires.toISOString() };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(data));
}

function getConsent(): ConsentData | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const data: ConsentData = JSON.parse(raw);
    // Check if consent has expired
    if (new Date(data.expires) < new Date()) {
      localStorage.removeItem(CONSENT_KEY);
      return null;
    }
    return data;
  } catch {
    localStorage.removeItem(CONSENT_KEY);
    return null;
  }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = getConsent();
    if (!consent) {
      // Delay slightly to avoid layout flash on initial load
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    setConsent('all');
    setVisible(false);
  };

  const handleEssentialOnly = () => {
    setConsent('essential');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className={styles.wrapper}
    >
      <div className={styles.banner}>
        {/* Text */}
        <p className={styles.text}>
          We use{' '}
          <strong className={styles.textStrong}>
            essential cookies
          </strong>{' '}
          for authentication and preferences. Optional cookies help us improve
          the experience. Read our{' '}
          <Link href="/privacy" className={styles.link}>
            cookie policy
          </Link>{' '}
          for details.
        </p>

        {/* Buttons */}
        <div className={styles.actions}>
          <button
            onClick={handleEssentialOnly}
            className={styles.essentialBtn}
          >
            Essential Only
          </button>
          <button
            onClick={handleAcceptAll}
            className={styles.acceptBtn}
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
