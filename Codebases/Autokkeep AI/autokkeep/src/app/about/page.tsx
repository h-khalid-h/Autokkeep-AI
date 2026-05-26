import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

export const metadata: Metadata = {
  title: 'About — Autokkeep',
  description: 'Meet the team behind Autokkeep. We\'re building the future of autonomous bookkeeping — eliminating manual data entry with dual-engine AI technology.',
};

const timeline = [
  {
    year: '2024',
    title: 'The Problem Discovered',
    description: 'After watching CPA firms lose $4.6B annually to manual bookkeeping tasks, we realized the industry was ripe for autonomous AI-driven disruption.',
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
    description: 'SOC 2 Type II certification, multi-currency support, and expansion to 500+ CPA firm partnerships across North America.',
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
    description: 'We tell you our AI accuracy is 95%+, not 99.9%. The system accuracy with human oversight is 99.9% — and we\'re transparent about the difference.',
  },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className="section" style={{ paddingTop: 'calc(var(--header-height) + 80px)' }}>
          <div className="container">
            <div className="section-header" style={{ maxWidth: '800px' }}>
              <div className="section-label">
                <span>🏢</span> About Autokkeep
              </div>
              <h1 className="text-display" style={{ marginBottom: '24px' }}>
                The ultimate user experience for bookkeeping is{' '}
                <span className="text-gradient">no experience at all.</span>
              </h1>
              <p className="section-subtitle" style={{ maxWidth: '700px' }}>
                We&apos;re building an autonomous financial intelligence layer that works silently in the background — classifying, reconciling, and closing books in real time. The only time you see Autokkeep is when it genuinely needs your input.
              </p>
            </div>
          </div>
        </section>

        {/* Mission */}
        <section className="section-sm">
          <div className="container">
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '64px',
              alignItems: 'center',
            }}>
              <div>
                <h2 className="text-h2" style={{ marginBottom: '16px' }}>
                  Why We Exist
                </h2>
                <p className="text-body-lg" style={{ marginBottom: '16px' }}>
                  300,000 accountants have left the profession. CPA exam candidates have declined 30%+. Finance roles take 73 days to fill. The accounting talent crisis isn&apos;t coming — it&apos;s here.
                </p>
                <p className="text-body">
                  Meanwhile, AI capabilities have reached a point where 95%+ of routine bookkeeping tasks can be automated with human-level accuracy. The question isn&apos;t &quot;should we automate bookkeeping?&quot; — it&apos;s &quot;why hasn&apos;t someone done it properly yet?&quot;
                </p>
                <p className="text-body" style={{ marginTop: '12px' }}>
                  Both Botkeeper and Bench.co tried and failed — because they relied on hybrid AI + human models that couldn&apos;t scale economically. Autokkeep takes a different approach: AI-first with structured human oversight, not human-first with AI assistance.
                </p>
              </div>
              <div>
                <div className="card-elevated" style={{ padding: '32px' }}>
                  <div className="stat-value" style={{ fontSize: '4rem', marginBottom: '8px' }}>$32B+</div>
                  <div className="text-h4" style={{ marginBottom: '8px' }}>Total Addressable Market</div>
                  <p className="text-body">
                    The AI accounting market is projected to grow from $5B in 2025 to $53B by 2030, driven by the accountant shortage and enterprise AI adoption.
                  </p>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px',
                    marginTop: '24px',
                  }}>
                    <div>
                      <div className="stat-value" style={{ fontSize: '1.5rem' }}>$8.5B</div>
                      <div className="text-caption">SAM</div>
                    </div>
                    <div>
                      <div className="stat-value" style={{ fontSize: '1.5rem' }}>$1.2B</div>
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

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '32px',
              maxWidth: '600px',
              margin: '0 auto',
            }}>
              {timeline.map((item, index) => (
                <div key={item.year} style={{
                  display: 'flex',
                  gap: '24px',
                  alignItems: 'flex-start',
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    flexShrink: 0,
                  }}>
                    <div className="badge badge-accent" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                      {item.year}
                    </div>
                    {index < timeline.length - 1 && (
                      <div style={{
                        width: '2px',
                        height: '60px',
                        background: 'var(--border-primary)',
                      }} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-h4" style={{ marginBottom: '4px' }}>{item.title}</h3>
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
                <div key={value.title} className="card" style={{ padding: '32px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '16px' }}>{value.icon}</div>
                  <h3 className="text-h4" style={{ marginBottom: '8px' }}>{value.title}</h3>
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

            <div className="card-elevated" style={{
              maxWidth: '700px',
              margin: '0 auto',
              padding: '32px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              lineHeight: '2',
              color: 'var(--text-secondary)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span>Frontend</span>
                <span style={{ color: 'var(--accent-primary)' }}>Next.js + Vanilla CSS → Vercel</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span>Backend</span>
                <span style={{ color: 'var(--accent-primary)' }}>Next.js API Routes + Supabase</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span>Database</span>
                <span style={{ color: 'var(--accent-primary)' }}>Supabase PostgreSQL (RLS)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span>AI Engine</span>
                <span style={{ color: 'var(--accent-primary)' }}>OpenAI / Claude API</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span>Auth</span>
                <span style={{ color: 'var(--accent-primary)' }}>Supabase Auth</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px', marginBottom: '8px' }}>
                <span>Payments</span>
                <span style={{ color: 'var(--accent-primary)' }}>Stripe</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Deploy</span>
                <span style={{ color: 'var(--accent-primary)' }}>Vercel + Supabase (free tiers)</span>
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
              Whether you&apos;re a CPA firm looking to scale, or a startup tired of manual bookkeeping — we&apos;d love to hear from you.
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <a href="/#cta" className="btn btn-primary btn-lg">Request Early Access</a>
              <a href="/contact" className="btn btn-secondary btn-lg">Get In Touch</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
