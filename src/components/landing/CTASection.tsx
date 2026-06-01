'use client';

import { useEffect, useRef, useState } from 'react';

export default function CTASection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = sectionRef.current?.querySelectorAll('.animate-on-scroll');
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Free Trial Request', email, message: 'Requested free trial via landing page CTA', source: 'cta' }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit. Please try again.');
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="cta-section section" id="cta" ref={sectionRef}>
      <div className="container">
        <h2 className="cta-title animate-on-scroll">
          Stop Guessing. <span className="text-gradient">Start Understanding.</span>
        </h2>
        <p className="cta-subtitle animate-on-scroll delay-1">
          Join thousands of small businesses that finally understand their finances. Get started in minutes — no accounting knowledge required.
        </p>

        {!submitted ? (
          <div className="animate-on-scroll delay-2">
            <form className="cta-form" onSubmit={handleSubmit}>
              <input
                type="email"
                className="input input-lg"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
                aria-label="Email address"
                id="cta-email-input"
              />
              <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Start Free'}
              </button>
            </form>
            {submitError && (
              <p style={{ color: 'var(--destructive)', fontSize: '0.875rem', marginTop: '8px', textAlign: 'center' }}>
                {submitError}
              </p>
            )}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '24px',
              marginTop: '16px',
              flexWrap: 'wrap',
            }}>
              <a
                href="/contact"
                className="btn btn-secondary"
                style={{ fontSize: '0.875rem' }}
              >
                Schedule a Demo
              </a>
            </div>
          </div>
        ) : (
          <div className="animate-on-scroll" style={{
            padding: '24px 32px',
            background: 'var(--success-subtle)',
            border: '1px solid var(--success-border)',
            borderRadius: '12px',
            maxWidth: '480px',
            margin: '0 auto 24px',
            animation: 'slide-up-fade 0.3s ease forwards',
          }}>
            <p style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success)', marginBottom: '4px' }}>
              ✓ You&apos;re in!
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Check your inbox — we&apos;ve sent you a link to set up your account and connect your first bank. Your 14-day free trial starts now.
            </p>
          </div>
        )}

        <p className="cta-note animate-on-scroll delay-3">
          No credit card required · 14-day free trial · Cancel anytime
        </p>
      </div>
    </section>
  );
}
