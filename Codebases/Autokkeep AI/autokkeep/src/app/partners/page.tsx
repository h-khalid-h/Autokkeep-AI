'use client';

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

/* ─────────────────────── helpers ─────────────────────── */
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
const usd = (n: number) => `$${fmt(n)}`;

/* ─────────────── intersection-observer hook ─────────────── */
function useAnimateOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style: React.CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(40px)',
    transition: 'opacity 0.7s cubic-bezier(.16,1,.3,1), transform 0.7s cubic-bezier(.16,1,.3,1)',
  };

  return { ref, style };
}

/* ─────────────── Animated wrapper component ─────────────── */
function Anim({ children, delay = 0, style: extra, ...rest }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties } & React.HTMLAttributes<HTMLDivElement>) {
  const { ref, style } = useAnimateOnScroll();
  return (
    <div ref={ref} style={{ ...style, transitionDelay: `${delay}ms`, ...extra }} {...rest}>
      {children}
    </div>
  );
}

/* ─────────────── chevron icon ─────────────── */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="20" height="20" viewBox="0 0 20 20" fill="none"
      style={{
        transition: 'transform 0.3s ease',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        flexShrink: 0,
      }}
    >
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════ */
export default function PartnersPage() {
  /* ── calculator state ── */
  const [clients, setClients] = useState(50);
  const [fee, setFee] = useState(500);

  const currentRevenue = clients * fee * 12;
  const boostedRevenue = clients * 4 * fee * 12;
  const additionalRevenue = boostedRevenue - currentRevenue;
  const newCapacity = clients * 3;

  /* ── FAQ state ── */
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const toggleFaq = useCallback((i: number) => setOpenFaq(prev => (prev === i ? null : i)), []);

  /* ── form state ── */
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  const [firmName, setFirmName] = useState('');
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: firmName,
          email: email,
          subject: 'Partner Program Inquiry',
          message: `CPA firm partner application from ${firmName}`,
        }),
      });
      if (response.ok) {
        setFormSubmitted(true);
      }
    } catch (err) {
      console.error('Partner form submission failed:', err);
    }
  };

  /* ────────── inline‑style tokens (supplement CSS vars) ────────── */
  const s = {
    accent: 'var(--accent-primary)',
    textSec: 'var(--text-secondary)',
    border: 'var(--border-primary)',
    success: 'var(--success)',
    successBorder: 'var(--success-border)',
    successSubtle: 'var(--success-subtle)',
    mono: 'var(--font-mono)',
    bgSec: 'var(--bg-secondary)',
    bgTer: 'var(--bg-tertiary)',
  };

  return (
    <>
      <Navbar />

      <main>
        {/* ───────────────── 1  HERO ───────────────── */}
        <section className="section" style={{ paddingTop: 'calc(var(--header-height) + 80px)', textAlign: 'center' }}>
          <div className="container">
            <Anim>
              <span className="section-label">🦾 For CPA Firms</span>
            </Anim>

            <Anim delay={100}>
              <h1 className="text-display" style={{ marginTop: 24 }}>
                The Accountant&apos;s <span className="text-gradient">Iron Man Suit.</span>
              </h1>
            </Anim>

            <Anim delay={200}>
              <p className="text-body-lg" style={{ maxWidth: 720, margin: '24px auto 0', color: s.textSec }}>
                Stop losing talent. Stop turning away clients. Autokkeep lets your existing team handle 4x the client load
                — with AI doing the heavy lifting and your CPAs providing the strategic oversight.
              </p>
            </Anim>

            <Anim delay={300} style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 40, flexWrap: 'wrap' }}>
              <a href="#partner-cta" className="btn btn-primary btn-lg">Start Free 60-Day Pilot</a>
              <a href="/demo/shadow-audit" className="btn btn-secondary btn-lg">See Shadow Audit Demo</a>
            </Anim>
          </div>
        </section>

        {/* ───────────────── 2  THE PROBLEM ───────────────── */}
        <section className="section">
          <div className="container">
            <div className="section-header">
              <Anim><span className="section-label">📊 The Crisis</span></Anim>
              <Anim delay={100}>
                <h2 className="section-title">
                  The Accounting Profession is <span className="text-gradient">Breaking</span>
                </h2>
              </Anim>
            </div>

            <div className="grid-3" style={{ marginTop: 48 }}>
              {[
                { value: '300K+', desc: 'Accountants have left the profession since 2020' },
                { value: '73 Days', desc: 'Average time to fill a finance role' },
                { value: '30%+', desc: 'Decline in CPA exam candidates' },
              ].map((stat, i) => (
                <Anim key={i} delay={i * 120}>
                  <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                    <div className="stat-value" style={{ color: s.accent, marginBottom: 12 }}>{stat.value}</div>
                    <p className="text-body" style={{ color: s.textSec }}>{stat.desc}</p>
                  </div>
                </Anim>
              ))}
            </div>

            <Anim delay={400} style={{ marginTop: 32 }}>
              <div className="card-accent" style={{ textAlign: 'center', padding: '32px 40px' }}>
                <p className="text-body-lg" style={{ margin: 0 }}>
                  The math is simple: fewer accountants + more regulations + growing businesses = <strong>unsustainable</strong>. Unless you change the equation.
                </p>
              </div>
            </Anim>
          </div>
        </section>

        {/* ───────────────── 3  HOW IT WORKS ───────────────── */}
        <section className="section">
          <div className="container">
            <div className="section-header">
              <Anim><span className="section-label">⚡ How It Works</span></Anim>
              <Anim delay={100}>
                <h2 className="section-title">
                  Three Steps to <span className="text-gradient">4x Capacity</span>
                </h2>
              </Anim>
            </div>

            <div className="grid-3" style={{ marginTop: 48 }}>
              {[
                { num: '01', title: 'Onboard Your Clients', body: 'Connect bank feeds via Plaid. Map chart of accounts. Set approval workflows. 48 hours, not 48 days.' },
                { num: '02', title: 'AI Handles Daily Bookkeeping', body: 'Transactions are auto-categorized, reconciled, and posted in real-time. The dual-engine architecture handles 95%+ autonomously.' },
                { num: '03', title: 'CPAs Review Exceptions', body: 'Your team focuses only on the 5% that needs human judgment. Review flagged items, approve batches, and provide strategic advisory — the work they actually enjoy.' },
              ].map((step, i) => (
                <Anim key={i} delay={i * 140}>
                  <div className="card" style={{ padding: '40px 32px', height: '100%' }}>
                    <span
                      className="text-h2"
                      style={{
                        fontFamily: s.mono,
                        color: s.accent,
                        opacity: 0.35,
                        display: 'block',
                        marginBottom: 16,
                        lineHeight: 1,
                      }}
                    >
                      {step.num}
                    </span>
                    <h3 className="text-h4" style={{ marginBottom: 12 }}>{step.title}</h3>
                    <p className="text-body" style={{ color: s.textSec, margin: 0 }}>{step.body}</p>
                  </div>
                </Anim>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────────── 4  REVENUE CALCULATOR ───────────────── */}
        <section className="section">
          <div className="container">
            <div className="section-header">
              <Anim><span className="section-label">💰 Revenue Calculator</span></Anim>
              <Anim delay={100}>
                <h2 className="section-title">
                  Calculate Your <span className="text-gradient">Growth Potential</span>
                </h2>
              </Anim>
            </div>

            <Anim delay={200} style={{ maxWidth: 800, margin: '48px auto 0' }}>
              <div className="card-elevated" style={{ padding: '48px 40px' }}>
                {/* Sliders */}
                <div style={{ marginBottom: 36 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label className="text-body" style={{ fontWeight: 600 }}>Number of Clients</label>
                    <span className="text-body" style={{ fontFamily: s.mono, color: s.accent, fontWeight: 700 }}>{clients}</span>
                  </div>
                  <input
                    type="range" min={10} max={500} step={10} value={clients}
                    onChange={e => setClients(Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: 'var(--accent-primary)',
                      height: 6,
                      cursor: 'pointer',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span className="text-caption" style={{ color: s.textSec }}>10</span>
                    <span className="text-caption" style={{ color: s.textSec }}>500</span>
                  </div>
                </div>

                <div style={{ marginBottom: 36 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label className="text-body" style={{ fontWeight: 600 }}>Average Monthly Fee Per Client ($)</label>
                    <span className="text-body" style={{ fontFamily: s.mono, color: s.accent, fontWeight: 700 }}>${fmt(fee)}</span>
                  </div>
                  <input
                    type="range" min={100} max={2000} step={50} value={fee}
                    onChange={e => setFee(Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: 'var(--accent-primary)',
                      height: 6,
                      cursor: 'pointer',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span className="text-caption" style={{ color: s.textSec }}>$100</span>
                    <span className="text-caption" style={{ color: s.textSec }}>$2,000</span>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: s.border, margin: '8px 0 36px' }} />

                {/* Output grid */}
                <div className="grid-2" style={{ gap: 24 }}>
                  <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                    <p className="text-caption" style={{ color: s.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Annual Revenue</p>
                    <p className="text-h3" style={{ margin: 0, fontFamily: s.mono }}>{usd(currentRevenue)}</p>
                  </div>
                  <div className="card" style={{ padding: 24, textAlign: 'center', borderColor: s.accent }}>
                    <p className="text-caption" style={{ color: s.accent, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>With Autokkeep (4x Capacity)</p>
                    <p className="text-h3" style={{ margin: 0, fontFamily: s.mono, color: s.accent }}>{usd(boostedRevenue)}</p>
                  </div>
                  <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                    <p className="text-caption" style={{ color: s.accent, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Additional Annual Revenue</p>
                    <p className="stat-value" style={{ color: s.accent, margin: 0 }}>{usd(additionalRevenue)}</p>
                  </div>
                  <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                    <p className="text-caption" style={{ color: s.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Client Capacity</p>
                    <p className="text-h3" style={{ margin: 0, fontFamily: s.mono }}>+{fmt(newCapacity)} clients</p>
                  </div>
                </div>

                <p className="text-caption" style={{ color: s.textSec, marginTop: 24, textAlign: 'center', fontStyle: 'italic' }}>
                  Based on 4x capacity multiplier observed in pilot programs
                </p>
              </div>
            </Anim>
          </div>
        </section>

        {/* ───────────────── 5  SHADOW AUDIT CTA ───────────────── */}
        <section className="section-sm">
          <div className="container">
            <Anim>
              <div className="card-accent" style={{ textAlign: 'center', padding: '48px 40px' }}>
                <h2 className="text-h2" style={{ marginBottom: 16 }}>See It In Action</h2>
                <p className="text-body-lg" style={{ color: s.textSec, maxWidth: 640, margin: '0 auto 28px' }}>
                  Try our Shadow Audit Demo — upload any CSV of transactions and watch Autokkeep categorize them in real-time. No signup required.
                </p>
                <a href="/demo/shadow-audit" className="btn btn-primary btn-lg">Try Shadow Audit Demo →</a>
              </div>
            </Anim>
          </div>
        </section>

        {/* ───────────────── 6  PARTNER TIERS ───────────────── */}
        <section className="section">
          <div className="container">
            <div className="section-header">
              <Anim><span className="section-label">🏷️ Partner Pricing</span></Anim>
              <Anim delay={100}>
                <h2 className="section-title">
                  Simple, <span className="text-gradient">Scalable Pricing</span>
                </h2>
              </Anim>
            </div>

            <div className="grid-3" style={{ marginTop: 48 }}>
              {[
                {
                  name: 'Foundation',
                  price: '$89',
                  unit: '/entity/mo',
                  desc: 'For firms getting started with AI bookkeeping',
                  features: ['Up to 25 entities', 'Full dual-engine AI', 'Standard integrations', 'Email support', 'Monthly reporting'],
                  cta: 'Get Started',
                  highlight: false,
                },
                {
                  name: 'Scale',
                  price: '$69',
                  unit: '/entity/mo',
                  desc: 'For firms ready to transform',
                  features: ['25–100 entities', 'Everything in Foundation', 'Priority support', 'Custom chart of accounts', 'Dedicated success manager', 'White-label options'],
                  cta: 'Get Started',
                  highlight: true,
                },
                {
                  name: 'Enterprise',
                  price: 'Custom',
                  unit: '',
                  desc: 'For large firms with specific needs',
                  features: ['100+ entities', 'Everything in Scale', 'Custom AI training', 'SLA guarantees', 'On-premise option', 'Direct engineering support'],
                  cta: 'Contact Sales',
                  highlight: false,
                },
              ].map((tier, i) => (
                <Anim key={i} delay={i * 140}>
                  <div
                    className="card"
                    style={{
                      padding: '40px 32px',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      overflow: 'hidden',
                      ...(tier.highlight
                        ? { borderColor: 'var(--accent-primary)', boxShadow: '0 0 40px rgba(30, 111, 255, 0.12)' }
                        : {}),
                    }}
                  >
                    {tier.highlight && (
                      <span
                        className="badge badge-accent"
                        style={{ position: 'absolute', top: 16, right: 16 }}
                      >
                        Most Popular
                      </span>
                    )}

                    <h3 className="text-h4" style={{ marginBottom: 8 }}>{tier.name}</h3>
                    <div style={{ marginBottom: 8 }}>
                      <span className="text-h2" style={{ fontFamily: s.mono }}>{tier.price}</span>
                      {tier.unit && <span className="text-caption" style={{ color: s.textSec }}>{tier.unit}</span>}
                    </div>
                    <p className="text-body" style={{ color: s.textSec, marginBottom: 24 }}>{tier.desc}</p>

                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', flex: 1 }}>
                      {tier.features.map((f, fi) => (
                        <li
                          key={fi}
                          className="text-body"
                          style={{
                            padding: '8px 0',
                            borderBottom: `1px solid ${s.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <span style={{ color: s.success, fontSize: 16, lineHeight: 1 }}>✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>

                    <a
                      href="#partner-cta"
                      className={`btn ${tier.highlight ? 'btn-primary' : 'btn-secondary'} btn-lg`}
                      style={{ width: '100%', textAlign: 'center' }}
                    >
                      {tier.cta}
                    </a>
                  </div>
                </Anim>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────────── 7  FAQ ───────────────── */}
        <section className="section">
          <div className="container">
            <div className="section-header">
              <Anim><span className="section-label">❓ Common Questions</span></Anim>
              <Anim delay={100}>
                <h2 className="section-title">
                  Addressing Your <span className="text-gradient">Concerns</span>
                </h2>
              </Anim>
            </div>

            <div style={{ maxWidth: 800, margin: '48px auto 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                {
                  q: 'Is the AI safe? Will it make errors?',
                  a: 'Autokkeep uses a dual-engine architecture. The deterministic engine handles routine transactions with rule-based precision (zero AI hallucination risk). The contextual AI engine handles complex transactions but always flags low-confidence items for human review. Combined with human oversight, system accuracy exceeds 95% on known merchants, approaching 99%+ with human oversight.',
                },
                {
                  q: 'What about data privacy and security?',
                  a: 'We are SOC 2 Type II ready from day one. All data is encrypted with AES-256 at rest and TLS 1.3 in transit. Row-level security ensures no client can ever see another client\u2019s data. Your financial data is never used for AI model training — guaranteed by DPA.',
                },
                {
                  q: 'How does billing work vs. our hourly model?',
                  a: 'Autokkeep enables value-based pricing. Instead of billing clients hourly for bookkeeping, you charge a flat monthly fee while AI handles the work. Your cost per entity drops dramatically as volume increases, turning bookkeeping from a cost center into a profit center.',
                },
                {
                  q: 'How long does onboarding take?',
                  a: 'Most firms are fully onboarded within 48 hours. We handle bank feed connections via Plaid, chart of accounts mapping, and workflow configuration. Your team gets dedicated onboarding support and training.',
                },
                {
                  q: 'What if a client has unusual transactions?',
                  a: 'The system uses a human-in-the-loop (HITL) workflow. Any transaction below the confidence threshold is routed to a suspense account and flagged for CPA review. Your team always has the final say. The AI learns from these corrections, improving accuracy over time.',
                },
              ].map((item, i) => {
                const isOpen = openFaq === i;
                return (
                  <Anim key={i} delay={i * 80}>
                    <div
                      className="card"
                      style={{
                        overflow: 'hidden',
                        transition: 'border-color 0.3s ease',
                        ...(isOpen ? { borderColor: 'var(--accent-primary)' } : {}),
                      }}
                    >
                      <button
                        onClick={() => toggleFaq(i)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 16,
                          padding: '20px 24px',
                          background: 'none',
                          border: 'none',
                          color: 'inherit',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span className="text-h4" style={{ margin: 0, fontSize: '1.05rem' }}>{item.q}</span>
                        <Chevron open={isOpen} />
                      </button>

                      <div
                        style={{
                          maxHeight: isOpen ? 300 : 0,
                          opacity: isOpen ? 1 : 0,
                          overflow: 'hidden',
                          transition: 'max-height 0.4s cubic-bezier(.16,1,.3,1), opacity 0.3s ease',
                        }}
                      >
                        <p className="text-body" style={{ padding: '0 24px 24px', margin: 0, color: s.textSec, lineHeight: 1.7 }}>
                          {item.a}
                        </p>
                      </div>
                    </div>
                  </Anim>
                );
              })}
            </div>
          </div>
        </section>

        {/* ───────────────── 8  CTA / FORM ───────────────── */}
        <section className="cta-section" id="partner-cta">
          <div className="container" style={{ textAlign: 'center' }}>
            <Anim>
              <h2 className="cta-title">
                Start Your Free <span className="text-gradient">60-Day Pilot</span>
              </h2>
            </Anim>
            <Anim delay={100}>
              <p className="cta-subtitle">
                No credit card required. Full platform access. Dedicated onboarding support.
              </p>
            </Anim>

            <Anim delay={200} style={{ maxWidth: 480, margin: '40px auto 0' }}>
              {formSubmitted ? (
                <div
                  className="card"
                  style={{
                    padding: '40px 32px',
                    textAlign: 'center',
                    borderColor: s.successBorder,
                    background: s.successSubtle,
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                  <h3 className="text-h3" style={{ marginBottom: 8 }}>You&apos;re In!</h3>
                  <p className="text-body" style={{ color: s.textSec, margin: 0 }}>
                    We&apos;ll be in touch within 24 hours to set up your pilot.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <input
                    type="email"
                    required
                    placeholder="Work email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: 12,
                      border: `1px solid ${s.border}`,
                      background: s.bgSec,
                      color: 'inherit',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                      transition: 'border-color 0.2s ease',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-primary)')}
                  />
                  <input
                    type="text"
                    required
                    placeholder="Firm name"
                    value={firmName}
                    onChange={e => setFirmName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: 12,
                      border: `1px solid ${s.border}`,
                      background: s.bgSec,
                      color: 'inherit',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                      transition: 'border-color 0.2s ease',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-primary)')}
                  />
                  <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                    Start Free Pilot
                  </button>
                </form>
              )}
            </Anim>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
