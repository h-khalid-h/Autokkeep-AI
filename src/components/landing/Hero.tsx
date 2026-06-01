'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';

const typewriterPhrases = [
  'categorizing transactions manually.',
  'waiting weeks for your books.',
  'guessing where your money went.',
  'being surprised by cash flow issues.',
  'paying for answers you should have.',
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
            AI Financial Operations Platform
          </div>

          <h1 className="hero-title">
            Your AI
            <br />
            <span className="text-gradient">Financial Operator.</span>
          </h1>

          <p className="hero-subtitle">
            Stop{' '}
            <span className="hero-typewriter">{displayText}</span>
            <br />
            Autokkeep automatically organizes transactions, keeps your books updated, explains financial activity, and helps you make smarter business decisions.
          </p>

          <p className="hero-subtitle" style={{ fontSize: '0.9375rem', opacity: 0.8, marginTop: '-8px' }}>
            Connect your accounts once. Let AI handle the bookkeeping while you focus on growing your business.
          </p>

          <div className="hero-ctas">
            <a href="#cta" className="btn btn-primary btn-lg">
              Start Free
            </a>
            <a href="#solution" className="btn btn-secondary btn-lg">
              See How It Works →
            </a>
          </div>

          <div className="hero-trust">
            <div className="hero-trust-item">
              <span className="hero-trust-icon" aria-hidden="true">🏦</span>
              Bank-Grade Encryption
            </div>
            <div className="hero-trust-item">
              <span className="hero-trust-icon" aria-hidden="true">🔒</span>
              SOC 2 Ready
            </div>
            <div className="hero-trust-item">
              <span className="hero-trust-icon" aria-hidden="true">✓</span>
              GAAP Compliant
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-dashboard-preview">
            <Image
              src="/images/hero-dashboard.png"
              alt="Autokkeep AI financial operations dashboard showing real-time insights, cash flow monitoring, and automated bookkeeping"
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
            <span className="badge badge-info">📊</span>
            <span>Revenue up 12% vs last month</span>
          </div>

          <div className="hero-float-card hero-float-card-3">
            <span className="badge badge-warning">⚠️</span>
            <span>Duplicate payment detected</span>
          </div>
        </div>
      </div>
    </section>
  );
}
