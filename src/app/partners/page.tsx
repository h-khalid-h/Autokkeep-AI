'use client';

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import styles from './page.module.css';

/* ─────────────────────── helpers ─────────────────────── */
const fmt = (n: number) => new Intl.NumberFormat(undefined).format(n);
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

  /* dynamic — visibility-driven animation */
  const style: React.CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(40px)',
    transition: 'opacity 0.7s cubic-bezier(.16,1,.3,1), transform 0.7s cubic-bezier(.16,1,.3,1)',
  };

  return { ref, style };
}

/* ─────────────── Animated wrapper component ─────────────── */
function Anim({ children, delay = 0, style: extra, className, ...rest }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const { ref, style } = useAnimateOnScroll();
  return (
    <div ref={ref} style={{ ...style, transitionDelay: `${delay}ms`, ...extra }} className={className} {...rest}>
      {children}
    </div>
  );
}

/* ─────────────── chevron icon ─────────────── */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="20" height="20" viewBox="0 0 20 20" fill="none"
      className={styles.chevron}
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} /* dynamic */
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

  return (
    <>
      <Navbar />

      <main>
        {/* ───────────────── 1  HERO ───────────────── */}
        <section className={`section ${styles.heroSection}`}>
          <div className="container">
            <Anim>
              <span className="section-label">🦾 Built for Accounting Professionals</span>
            </Anim>

            <Anim delay={100}>
              <h1 className={`text-display ${styles.heroTitle}`}>
                The Accountant&apos;s <span className="text-gradient">Iron Man Suit.</span>
              </h1>
            </Anim>

            <Anim delay={200}>
              <p className={`text-body-lg ${styles.heroSubtitle}`}>
                Autokkeep helps accounting firms serve more clients with AI-powered automation.
                Stop losing talent. Stop turning away clients. Let your existing team handle 4x the client load
                — with AI doing the heavy lifting and your CPAs providing the strategic oversight.
              </p>
            </Anim>

            <Anim delay={300} className={styles.heroCta}>
              <a href="#partner-cta" className="btn btn-primary btn-lg">Become a Partner</a>
              <a href="/demo/shadow-audit" className="btn btn-secondary btn-lg">See Shadow Audit Demo</a>
            </Anim>
          </div>
        </section>

        {/* ───────────────── 1b  KEY BENEFITS ───────────────── */}
        <section className="section-sm">
          <div className="container">
            <div className="section-header">
              <Anim><span className="section-label">✨ Why CPAs Choose Autokkeep</span></Anim>
              <Anim delay={100}>
                <h2 className="section-title">
                  Transform Your <span className="text-gradient">Practice</span>
                </h2>
              </Anim>
            </div>

            <div className={`grid-3 ${styles.gridMt48}`}>
              {[
                { icon: '🚀', title: 'Serve 3x More Clients', body: 'Without adding staff. AI handles routine bookkeeping so your team focuses on advisory work that drives revenue.' },
                { icon: '🤖', title: 'Automated Bookkeeping', body: 'Free your team from data entry. AI categorizes, reconciles, and posts transactions automatically — 95%+ accuracy.' },
                { icon: '🏢', title: 'Multi-Entity Portfolio', body: 'Manage all your clients from a single dashboard. Portfolio-wide analytics, alerts, and reporting across every entity.' },
                { icon: '🛡️', title: 'AI Catches Errors First', body: 'Dual-engine architecture flags anomalies, duplicate payments, and suspicious transactions before you review.' },
                { icon: '⚡', title: 'Month-End in Hours', body: 'Close in hours, not days. Automated reconciliation, receipt auditing, and readiness scoring streamline every close.' },
                { icon: '💰', title: 'Value-Based Pricing', body: 'Move from hourly billing to flat monthly fees. Your cost per entity drops while margins increase dramatically.' },
              ].map((benefit, i) => (
                <Anim key={i} delay={i * 100}>
                  <div className={`card ${styles.benefitCard}`}>
                    <span className={styles.benefitIcon}>{benefit.icon}</span>
                    <h3 className={`text-h4 ${styles.benefitTitle}`}>{benefit.title}</h3>
                    <p className={`text-body ${styles.benefitBody}`}>{benefit.body}</p>
                  </div>
                </Anim>
              ))}
            </div>
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

            <div className={`grid-3 ${styles.gridMt48}`}>
              {[
                { value: '300K+', desc: 'Accountants have left the profession since 2020' },
                { value: '73 Days', desc: 'Average time to fill a finance role' },
                { value: '30%+', desc: 'Decline in CPA exam candidates' },
              ].map((stat, i) => (
                <Anim key={i} delay={i * 120}>
                  <div className={`card ${styles.statCard}`}>
                    <div className={`stat-value ${styles.statValue}`}>{stat.value}</div>
                    <p className={`text-body ${styles.statDesc}`}>{stat.desc}</p>
                  </div>
                </Anim>
              ))}
            </div>

            <Anim delay={400} className={styles.accentBannerMargin}>
              <div className={`card-accent ${styles.accentBanner}`}>
                <p className={`text-body-lg ${styles.accentBannerText}`}>
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

            <div className={`grid-3 ${styles.gridMt48}`}>
              {[
                { num: '01', title: 'Onboard Your Clients', body: 'Connect bank feeds via Plaid. Map chart of accounts. Set approval workflows. 48 hours, not 48 days.' },
                { num: '02', title: 'AI Handles Daily Bookkeeping', body: 'Transactions are auto-categorized, reconciled, and posted in real-time. The dual-engine architecture handles 95%+ automatically.' },
                { num: '03', title: 'CPAs Review Exceptions', body: 'Your team focuses only on the 5% that needs human judgment. Review flagged items, approve batches, and provide strategic advisory — the work they actually enjoy.' },
              ].map((step, i) => (
                <Anim key={i} delay={i * 140}>
                  <div className={`card ${styles.stepCard}`}>
                    <span className={`text-h2 ${styles.stepNumber}`}>
                      {step.num}
                    </span>
                    <h3 className={`text-h4 ${styles.stepTitle}`}>{step.title}</h3>
                    <p className={`text-body ${styles.stepBody}`}>{step.body}</p>
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

            <Anim delay={200} className={styles.calcWrapper}>
              <div className={`card-elevated ${styles.calcCard}`}>
                {/* Sliders */}
                <div className={styles.sliderGroup}>
                  <div className={styles.sliderHeader}>
                    <label className={`text-body ${styles.sliderLabel}`}>Number of Clients</label>
                    <span className={`text-body ${styles.sliderValue}`}>{clients}</span>
                  </div>
                  <input
                    type="range" min={10} max={500} step={10} value={clients}
                    onChange={e => setClients(Number(e.target.value))}
                    className={styles.sliderInput}
                  />
                  <div className={styles.sliderRange}>
                    <span className={`text-caption ${styles.sliderRangeLabel}`}>10</span>
                    <span className={`text-caption ${styles.sliderRangeLabel}`}>500</span>
                  </div>
                </div>

                <div className={styles.sliderGroup}>
                  <div className={styles.sliderHeader}>
                    <label className={`text-body ${styles.sliderLabel}`}>Average Monthly Fee Per Client ($)</label>
                    <span className={`text-body ${styles.sliderValue}`}>${fmt(fee)}</span>
                  </div>
                  <input
                    type="range" min={100} max={2000} step={50} value={fee}
                    onChange={e => setFee(Number(e.target.value))}
                    className={styles.sliderInput}
                  />
                  <div className={styles.sliderRange}>
                    <span className={`text-caption ${styles.sliderRangeLabel}`}>$100</span>
                    <span className={`text-caption ${styles.sliderRangeLabel}`}>$2,000</span>
                  </div>
                </div>

                {/* Divider */}
                <div className={styles.divider} />

                {/* Output grid */}
                <div className={`grid-2 ${styles.outputGrid}`}>
                  <div className={`card ${styles.outputCard}`}>
                    <p className={`text-caption ${styles.outputLabel}`}>Current Annual Revenue</p>
                    <p className={`text-h3 ${styles.outputValue}`}>{usd(currentRevenue)}</p>
                  </div>
                  <div className={`card ${styles.outputCardAccent}`}>
                    <p className={`text-caption ${styles.outputLabelAccent}`}>With Autokkeep (4x Capacity)</p>
                    <p className={`text-h3 ${styles.outputValueAccent}`}>{usd(boostedRevenue)}</p>
                  </div>
                  <div className={`card ${styles.outputCard}`}>
                    <p className={`text-caption ${styles.outputLabelAccent}`}>Additional Annual Revenue</p>
                    <p className={`stat-value ${styles.outputStatAccent}`}>{usd(additionalRevenue)}</p>
                  </div>
                  <div className={`card ${styles.outputCard}`}>
                    <p className={`text-caption ${styles.outputLabel}`}>New Client Capacity</p>
                    <p className={`text-h3 ${styles.outputValue}`}>+{fmt(newCapacity)} clients</p>
                  </div>
                </div>

                <p className={`text-caption ${styles.calcDisclaimer}`}>
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
              <div className={`card-accent ${styles.shadowAuditCard}`}>
                <h2 className={`text-h2 ${styles.shadowAuditTitle}`}>See It In Action</h2>
                <p className={`text-body-lg ${styles.shadowAuditBody}`}>
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

            <div className={`grid-3 ${styles.gridMt48}`}>
              {[
                {
                  name: 'Foundation',
                  price: '$89',
                  unit: '/entity/mo',
                  desc: 'For firms getting started with AI financial operations',
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
                    className={`card ${tier.highlight ? styles.tierCardHighlight : styles.tierCard}`}
                  >
                    {tier.highlight && (
                      <span
                        className={`badge badge-accent ${styles.tierBadge}`}
                      >
                        Most Popular
                      </span>
                    )}

                    <h3 className={`text-h4 ${styles.tierName}`}>{tier.name}</h3>
                    <div className={styles.tierPriceRow}>
                      <span className={`text-h2 ${styles.tierPrice}`}>{tier.price}</span>
                      {tier.unit && <span className={`text-caption ${styles.tierUnit}`}>{tier.unit}</span>}
                    </div>
                    <p className={`text-body ${styles.tierDesc}`}>{tier.desc}</p>

                    <ul className={styles.tierFeatures}>
                      {tier.features.map((f, fi) => (
                        <li
                          key={fi}
                          className={`text-body ${styles.tierFeatureItem}`}
                        >
                          <span className={styles.tierCheck}>✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>

                    <a
                      href="#partner-cta"
                      className={`btn ${tier.highlight ? 'btn-primary' : 'btn-secondary'} btn-lg ${styles.tierCta}`}
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

            <div className={styles.faqContainer}>
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
                      className={`card ${styles.faqCard}`}
                      style={isOpen ? { borderColor: 'var(--color-accent)' } : undefined} /* dynamic */
                    >
                      <button
                        onClick={() => toggleFaq(i)}
                        className={styles.faqButton}
                      >
                        <span className={`text-h4 ${styles.faqQuestion}`}>{item.q}</span>
                        <Chevron open={isOpen} />
                      </button>

                      <div
                        style={{
                          /* dynamic — open/close animation */
                          maxHeight: isOpen ? 300 : 0,
                          opacity: isOpen ? 1 : 0,
                          overflow: 'hidden',
                          transition: 'max-height 0.4s cubic-bezier(.16,1,.3,1), opacity 0.3s ease',
                        }}
                      >
                        <p className={`text-body ${styles.faqAnswer}`}>
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
          <div className={`container ${styles.ctaContainer}`}>
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
            <Anim delay={150}>
              <p className={`text-body ${styles.ctaSubtext}`}>
                Join the growing network of accounting firms transforming their practice with AI.
              </p>
            </Anim>

            <Anim delay={200} className={styles.ctaFormWrapper}>
              {formSubmitted ? (
                <div className={`card ${styles.successCard}`}>
                  <div className={styles.successEmoji}>🎉</div>
                  <h3 className={`text-h3 ${styles.successTitle}`}>You&apos;re In!</h3>
                  <p className={`text-body ${styles.successBody}`}>
                    We&apos;ll be in touch within 24 hours to set up your pilot.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className={styles.partnerForm}>
                  <input
                    type="email"
                    required
                    placeholder="Work email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={styles.formInput}
                  />
                  <input
                    type="text"
                    required
                    placeholder="Firm name"
                    value={firmName}
                    onChange={e => setFirmName(e.target.value)}
                    className={styles.formInput}
                  />
                  <button type="submit" className={`btn btn-primary btn-lg ${styles.submitBtn}`}>
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
