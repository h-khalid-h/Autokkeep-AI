'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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
    <>
      <div
        role="dialog"
        aria-label="Cookie consent"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          padding: '16px',
          pointerEvents: 'none',
          animation: 'cookieFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <div
          style={{
            maxWidth: '900px',
            margin: '0 auto',
            background: 'rgba(15, 17, 26, 0.92)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 'var(--radius-xl)',
            padding: '20px 24px',
            pointerEvents: 'all',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '24px',
            flexWrap: 'wrap',
          }}
        >
          {/* Text */}
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              margin: 0,
              flex: '1 1 400px',
            }}
          >
            We use{' '}
            <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              essential cookies
            </strong>{' '}
            for authentication and preferences. Optional cookies help us improve
            the experience. Read our{' '}
            <Link
              href="/privacy"
              style={{
                color: 'var(--accent-primary)',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              cookie policy
            </Link>{' '}
            for details.
          </p>

          {/* Buttons */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexShrink: 0,
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={handleEssentialOnly}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: '1px solid var(--border-secondary)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontWeight: 500,
                fontFamily: 'inherit',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-secondary)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              Essential Only
            </button>
            <button
              onClick={handleAcceptAll}
              style={{
                padding: '10px 20px',
                background: 'var(--accent-gradient)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontWeight: 600,
                fontFamily: 'inherit',
                transition: 'all 0.2s ease',
                boxShadow: '0 0 20px rgba(91, 95, 230, 0.2)',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-gradient-hover)';
                e.currentTarget.style.boxShadow = 'var(--accent-glow)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent-gradient)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(91, 95, 230, 0.2)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Accept All
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cookieFadeIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
