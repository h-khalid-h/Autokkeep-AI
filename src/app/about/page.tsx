import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'About — Autokkeep',
  description: 'Meet the team behind Autokkeep. We\'re building the AI Financial Operations Platform for small businesses — helping you understand your finances, not just automate your bookkeeping.',
};

const timeline = [
  {
    year: '2024',
    title: 'The Problem Discovered',
    description: 'After watching small businesses lose billions annually to manual financial tasks, we realized the industry was ripe for AI-driven transformation.',
  },
  {
    year: '2025',
    title: 'Market Validation',
    description: 'Botkeeper and Bench.co shut down — both running hybrid AI + human models that couldn\'t scale. We saw the opportunity for a pure AI-first approach with proper human oversight.',
  },
  {
    year: '2026',
    title: 'Autokkeep Launches',
    description: 'Built from the ground up with a dual-engine architecture: deterministic precision for the 60% of transactions that are predictable, contextual AI for the rest.',
  },
  {
    year: 'Next',
    title: 'Scaling the Vision',
    description: 'SOC 2 Type II certification, expanded regional compliance engines, and scaling to thousands of small businesses worldwide.',
  },
];

const values = [
  {
    icon: '🔍',
    title: 'Transparency First',
    description: 'Every AI decision comes with an explanation. We never hide behind black-box algorithms — if the AI categorizes a transaction, you see exactly why.',
  },
  {
    icon: '🛡️',
    title: 'Security as Foundation',
    description: 'Financial data demands the highest security standards. Bank-grade encryption, row-level isolation, and immutable audit trails are non-negotiable.',
  },
  {
    icon: '🤝',
    title: 'AI Augments, Never Replaces',
    description: 'We don\'t replace accountants. We eliminate their most tedious work so they can focus on strategic advisory — the work they actually enjoy.',
  },
  {
    icon: '📊',
    title: 'Honest About Limitations',
    description: 'Our AI categorizes 95%+ of known merchant transactions correctly. Combined with human oversight, we achieve near-perfect accuracy — and we\'re transparent about the difference.',
  },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className={`section ${styles.heroSection}`}>
          <div className="container">
            <div className={`section-header ${styles.heroHeader}`}>
              <div className="section-label">
                <span>🏢</span> About Autokkeep
              </div>
              <h1 className={`text-display ${styles.heroTitle}`}>
                The AI Financial Operations Platform for{' '}
                <span className="text-gradient">Small Businesses.</span>
              </h1>
              <p className={`section-subtitle ${styles.heroSubtitle}`}>
                We&apos;re building an AI-powered financial intelligence platform that helps small businesses truly understand their finances — not just automate data entry. Autokkeep classifies, reconciles, and delivers actionable insights so you can make smarter decisions.
              </p>
            </div>
          </div>
        </section>

        {/* Mission */}
        <section className="section-sm">
          <div className="container">
            <div className={styles.missionGrid}>
              <div>
                <h2 className={`text-h2 ${styles.missionTitle}`}>
                  Why We Exist
                </h2>
                <p className={`text-body-lg ${styles.missionIntro}`}>
                  Small businesses spend 120+ hours per year on bookkeeping. 40% of SMBs say financial management is their biggest challenge. Meanwhile, 300,000 accountants have left the profession.
                </p>
                <p className="text-body">
                  Meanwhile, AI capabilities have reached a point where 95%+ of routine bookkeeping tasks can be automated with human-level accuracy. The question isn&apos;t &quot;should we automate bookkeeping?&quot; — it&apos;s &quot;why hasn&apos;t someone done it properly yet?&quot;
                </p>
                <p className={`text-body ${styles.missionFollow}`}>
                  Both Botkeeper and Bench.co tried and failed — because they relied on hybrid AI + human models that couldn&apos;t scale economically. Autokkeep takes a different approach: AI-first with structured human oversight, not human-first with AI assistance.
                </p>
              </div>
              <div>
                <div className={`card-elevated ${styles.marketCard}`}>
                  <div className={`stat-value ${styles.marketStatLarge}`}>$32B+</div>
                  <div className={`text-h4 ${styles.marketLabel}`}>Total Addressable Market</div>
                  <p className="text-body">
                    The AI accounting market is projected to grow from $5B in 2025 to $53B by 2030, driven by the accountant shortage and enterprise AI adoption.
                  </p>
                  <div className={styles.marketSubGrid}>
                    <div>
                      <div className={`stat-value ${styles.marketStatSmall}`}>$8.5B</div>
                      <div className="text-caption">SAM</div>
                    </div>
                    <div>
                      <div className={`stat-value ${styles.marketStatSmall}`}>$1.2B</div>
                      <div className="text-caption">SOM (Year 3)</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section className="section">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Our <span className="text-gradient">Journey</span></h2>
            </div>

            <div className={styles.timelineContainer}>
              {timeline.map((item, index) => (
                <div key={item.year} className={styles.timelineItem}>
                  <div className={styles.timelineSidebar}>
                    <div className={`badge badge-accent ${styles.timelineBadge}`}>
                      {item.year}
                    </div>
                    {index < timeline.length - 1 && (
                      <div className={styles.timelineLine} />
                    )}
                  </div>
                  <div>
                    <h3 className={`text-h4 ${styles.timelineTitle}`}>{item.title}</h3>
                    <p className="text-body">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="section-sm">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Our <span className="text-gradient">Principles</span></h2>
            </div>

            <div className="grid-2">
              {values.map((value) => (
                <div key={value.title} className={`card ${styles.valueCard}`}>
                  <div className={styles.valueIcon}>{value.icon}</div>
                  <h3 className={`text-h4 ${styles.valueTitle}`}>{value.title}</h3>
                  <p className="text-body">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Solo Founder Stack */}
        <section className="section">
          <div className="container">
            <div className="section-header">
              <div className="section-label">
                <span>⚡</span> Our Approach
              </div>
              <h2 className="section-title">
                Built by <span className="text-gradient">AI, for AI</span>
              </h2>
              <p className="section-subtitle">
                Autokkeep is built entirely with AI assistance — from code to design to documentation. We practice what we preach: AI handling the heavy lifting while humans provide strategic direction.
              </p>
            </div>

            <div className={`card-elevated ${styles.stackCard}`}>
              <div className={styles.stackRow}>
                <span>Frontend</span>
                <span className={styles.stackValue}>Next.js + Vanilla CSS → Vercel</span>
              </div>
              <div className={styles.stackRow}>
                <span>Backend</span>
                <span className={styles.stackValue}>Next.js API Routes + Supabase</span>
              </div>
              <div className={styles.stackRow}>
                <span>Database</span>
                <span className={styles.stackValue}>Supabase PostgreSQL (RLS)</span>
              </div>
              <div className={styles.stackRow}>
                <span>AI Engine</span>
                <span className={styles.stackValue}>OpenAI API</span>
              </div>
              <div className={styles.stackRow}>
                <span>Auth</span>
                <span className={styles.stackValue}>Supabase Auth</span>
              </div>
              <div className={styles.stackRow}>
                <span>Payments</span>
                <span className={styles.stackValue}>Stripe</span>
              </div>
              <div className={styles.stackRowLast}>
                <span>Deploy</span>
                <span className={styles.stackValue}>Vercel + Supabase (free tiers)</span>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta-section section">
          <div className="container">
            <h2 className="cta-title">
              Ready to <span className="text-gradient">Join Us</span>?
            </h2>
            <p className="cta-subtitle">
              Whether you&apos;re a growing startup, an established SMB, or a firm looking to scale — we&apos;d love to hear from you.
            </p>
            <div className={styles.ctaButtons}>
              <Link href="/#cta" className="btn btn-primary btn-lg">Request Early Access</Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">Get In Touch</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
