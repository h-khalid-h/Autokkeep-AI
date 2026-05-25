'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';

const typewriterPhrases = [
  'chasing receipts for 3 hours.',
  'closing books 15 days late.',
  'guessing expense categories.',
  'manual data entry errors.',
  'month-end reconciliation chaos.',
];

export default function Hero() {
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const animateTypewriter = useCallback(() => {
    const phrase = typewriterPhrases[currentPhrase];

    if (!isDeleting) {
      if (displayText.length < phrase.length) {
        setTimeout(() => setDisplayText(phrase.slice(0, displayText.length + 1)), 50);
      } else {
        setTimeout(() => setIsDeleting(true), 2000);
      }
    } else {
      if (displayText.length > 0) {
        setTimeout(() => setDisplayText(displayText.slice(0, -1)), 30);
      } else {
        setIsDeleting(false);
        setCurrentPhrase((prev) => (prev + 1) % typewriterPhrases.length);
      }
    }
  }, [currentPhrase, displayText, isDeleting]);

  useEffect(() => {
    const timer = setTimeout(animateTypewriter, 0);
    return () => clearTimeout(timer);
  }, [animateTypewriter]);

  return (
    <section className="hero" id="hero">
      <div className="hero-bg">
        <div className="hero-grid-pattern" />
      </div>

      <div className="hero-content">
        <div className="hero-text">
          <div className="hero-eyebrow">
            <span style={{ fontSize: '0.75rem' }}>⚡</span>
            AI-Native Bookkeeping Engine
          </div>

          <h1 className="hero-title">
            The end of the
            <br />
            <span className="text-gradient">monthly close.</span>
          </h1>

          <p className="hero-subtitle">
            Stop{' '}
            <span className="hero-typewriter">{displayText}</span>
            <br />
            Autokkeep is an autonomous AI agent that manages your entire ledger — from receipt capture to audit-ready financials — in real time.
          </p>

          <div className="hero-ctas">
            <a href="#cta" className="btn btn-primary btn-lg">
              Request Early Access
            </a>
            <a href="#solution" className="btn btn-secondary btn-lg">
              See How It Works →
            </a>
          </div>

          <div className="hero-trust">
            <div className="hero-trust-item">
              <span className="hero-trust-icon">🔒</span>
              SOC 2 Ready
            </div>
            <div className="hero-trust-item">
              <span className="hero-trust-icon">🏦</span>
              Bank-Grade Encryption
            </div>
            <div className="hero-trust-item">
              <span className="hero-trust-icon">✓</span>
              GAAP Compliant
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-dashboard-preview">
            <Image
              src="/images/hero-dashboard.png"
              alt="Autokkeep autonomous bookkeeping dashboard showing real-time P&L, cash flow chart, and transaction categorization"
              width={600}
              height={600}
              priority
            />
            <div className="hero-dashboard-overlay" />
          </div>

          {/* Floating cards */}
          <div className="hero-float-card hero-float-card-1">
            <span className="badge badge-success">✓ 98%</span>
            <span>AWS — Auto-categorized</span>
          </div>

          <div className="hero-float-card hero-float-card-2">
            <span className="badge badge-warning">⚠ 42%</span>
            <span>Unknown vendor — Flagged</span>
          </div>

          <div className="hero-float-card hero-float-card-3">
            <span className="badge badge-info">↻</span>
            <span>Receipt captured via Slack</span>
          </div>
        </div>
      </div>
    </section>
  );
}
