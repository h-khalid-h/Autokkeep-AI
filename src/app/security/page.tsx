import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

export const metadata: Metadata = {
  title: 'Security — Autokkeep',
  description: 'Bank-grade security for your financial data. AES-256 encryption, TLS 1.3, Row-Level Security, immutable audit trails, and SOC 2 compliance readiness.',
};

const securityLayers = [
  {
    icon: '🔐',
    title: 'Encryption at Rest & In Transit',
    items: [
      'AES-256 encryption for all stored data',
      'TLS 1.3 for all data in transit',
      'Managed key infrastructure via cloud providers',
      'Zero-knowledge architecture for sensitive credentials',
    ],
  },
  {
    icon: '🛡️',
    title: 'Row-Level Security (RLS)',
    items: [
      'Every database query automatically filtered by tenant ID',
      'No client can ever see another client\'s data — enforced at the database level',
      'PostgreSQL RLS policies enforced at the database level',
      'Logical isolation enforced through database-level policies',
    ],
  },
  {
    icon: '📋',
    title: 'Immutable Audit Trail',
    items: [
      'Every AI decision logged with full reasoning chain',
      'Hash-chained entries — cannot be modified retroactively',
      'Full compliance with SOX-adjacent audit requirements',
      'Export-ready for external auditor review',
    ],
  },
  {
    icon: '🤖',
    title: 'AI Data Security',
    items: [
      'Zero data used for model training — strict DPA with AI providers',
      'PII detection & redaction before inference',
      'Financial data never leaves managed infrastructure',
      'Structured output mode only — no freeform AI responses touching your ledger',
    ],
  },
  {
    icon: '🔑',
    title: 'Access Control',
    items: [
      'Role-based access control (RBAC) with least-privilege defaults',
      'Multi-factor authentication (MFA) supported via TOTP authenticator apps',
      'Session management with automatic timeout',
      'API keys scoped per-entity with rotation policies',
    ],
  },
  {
    icon: '📊',
    title: 'Compliance & Certifications',
    items: [
      'SOC 2 Type II — controls designed for compliance readiness',
      'GAAP & IFRS compliant double-entry bookkeeping',
      'GDPR-compliant data processing for EU clients',
      'Third-party penetration testing (planned)',
    ],
  },
];

export default function SecurityPage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="section" style={{ paddingTop: 'calc(var(--header-height) + 80px)' }}>
          <div className="container">
            <div className="section-header">
              <div className="section-label">
                <span>🛡️</span> Security
              </div>
              <h1 className="section-title">
                Bank-Grade Security. <span className="text-gradient">No Compromises.</span>
              </h1>
              <p className="section-subtitle">
                Financial data demands the highest security standards. Here&apos;s how Autokkeep protects every transaction, every audit trail, and every client relationship.
              </p>
            </div>

            {/* Security Commitment Banner */}
            <div className="card-accent" style={{
              textAlign: 'center',
              padding: '32px',
              marginBottom: '64px',
            }}>
              <p style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: '8px' }}>
                🔒 Our Security Promise
              </p>
              <p className="text-body" style={{ maxWidth: '600px', margin: '0 auto' }}>
                Your financial data is never used for AI model training. Every AI decision is logged with full transparency. No data leaves our managed infrastructure. Period.
              </p>
            </div>

            {/* Security Layers Grid */}
            <div className="grid-3" style={{ gap: '24px' }}>
              {securityLayers.map((layer) => (
                <div key={layer.title} className="card" style={{ padding: '32px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '16px' }}>{layer.icon}</div>
                  <h3 className="text-h4" style={{ marginBottom: '16px' }}>{layer.title}</h3>
                  <ul style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {layer.items.map((item) => (
                      <li key={item} style={{
                        fontSize: '0.875rem',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-start',
                      }}>
                        <span style={{ color: 'var(--success)', flexShrink: 0 }}>✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Data Flow Diagram */}
            <section className="section-sm">
              <div className="section-header">
                <h2 className="section-title">How Your Data <span className="text-gradient">Flows</span></h2>
                <p className="section-subtitle">
                  Every step of the pipeline is encrypted, logged, and access-controlled. No exceptions.
                </p>
              </div>

              <div className="arch-diagram">
                <div className="arch-flow">
                  <div className="arch-node" style={{ borderColor: 'var(--success-border)' }}>
                    <div className="arch-node-icon" style={{
                      background: 'var(--success-subtle)',
                      border: '1px solid var(--success-border)',
                      color: 'var(--success)',
                    }}>🔒</div>
                    <div className="arch-node-label">Bank API (TLS 1.3)</div>
                    <div className="arch-node-sublabel">Plaid encrypted tunnel</div>
                  </div>

                  <div className="arch-arrow">→</div>

                  <div className="arch-node" style={{ borderColor: 'var(--success-border)' }}>
                    <div className="arch-node-icon" style={{
                      background: 'var(--success-subtle)',
                      border: '1px solid var(--success-border)',
                      color: 'var(--success)',
                    }}>🛡️</div>
                    <div className="arch-node-label">PII Redaction</div>
                    <div className="arch-node-sublabel">Before AI inference</div>
                  </div>

                  <div className="arch-arrow">→</div>

                  <div className="arch-node" style={{ borderColor: 'var(--success-border)' }}>
                    <div className="arch-node-icon" style={{
                      background: 'var(--success-subtle)',
                      border: '1px solid var(--success-border)',
                      color: 'var(--success)',
                    }}>🤖</div>
                    <div className="arch-node-label">AI Engine (DPA)</div>
                    <div className="arch-node-sublabel">No training on your data</div>
                  </div>

                  <div className="arch-arrow">→</div>

                  <div className="arch-node" style={{ borderColor: 'var(--success-border)' }}>
                    <div className="arch-node-icon" style={{
                      background: 'var(--success-subtle)',
                      border: '1px solid var(--success-border)',
                      color: 'var(--success)',
                    }}>📋</div>
                    <div className="arch-node-label">Audit Trail (RLS)</div>
                    <div className="arch-node-sublabel">Immutable, hash-chained</div>
                  </div>
                </div>
              </div>
            </section>

            {/* AI Safety */}
            <section className="section-sm">
              <div className="section-header">
                <h2 className="section-title">AI <span className="text-gradient">Safety</span></h2>
                <p className="section-subtitle">
                  Our AI is designed with guardrails that prioritize accuracy and accountability over speed.
                </p>
              </div>

              <div className="grid-2" style={{ gap: '24px' }}>
                <div className="card" style={{ padding: '32px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '16px' }}>🚫</div>
                  <h3 className="text-h4" style={{ marginBottom: '8px' }}>No Training on Your Data</h3>
                  <p className="text-body">No financial data is used to train our AI models. Strict Data Processing Agreements with all AI providers ensure your data is processed in real-time only.</p>
                </div>
                <div className="card" style={{ padding: '32px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '16px' }}>📊</div>
                  <h3 className="text-h4" style={{ marginBottom: '8px' }}>Confidence-Scored Categorizations</h3>
                  <p className="text-body">All AI categorizations are confidence-scored — transactions below 95% are routed to human review. No blind automation touches your books.</p>
                </div>
                <div className="card" style={{ padding: '32px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⚙️</div>
                  <h3 className="text-h4" style={{ marginBottom: '8px' }}>Deterministic Filter First</h3>
                  <p className="text-body">Deterministic filter handles 60%+ of transactions without touching AI at all — rule-based, predictable, and zero-cost per transaction.</p>
                </div>
                <div className="card" style={{ padding: '32px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '16px' }}>✅</div>
                  <h3 className="text-h4" style={{ marginBottom: '8px' }}>Double-Entry Validation</h3>
                  <p className="text-body">Double-entry validation trigger ensures ledger integrity at the database level. Every debit must have a matching credit — enforced by PostgreSQL, not application code.</p>
                </div>
              </div>
            </section>

            {/* Compliance */}
            <section className="section-sm">
              <div className="section-header">
                <h2 className="section-title">Compliance <span className="text-gradient">Standards</span></h2>
                <p className="section-subtitle">
                  Built for regulatory readiness from day one — not bolted on as an afterthought.
                </p>
              </div>

              <div className="grid-2" style={{ gap: '24px' }}>
                <div className="card" style={{ padding: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '2rem' }}>🏛️</span>
                    <h3 className="text-h4" style={{ margin: 0 }}>SOC 2 Type II Readiness</h3>
                  </div>
                  <p className="text-body">Security architecture designed to align with SOC 2 Type II trust service criteria. Formal audit engagement on roadmap.</p>
                </div>
                <div className="card" style={{ padding: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '2rem' }}>🇪🇺</span>
                    <h3 className="text-h4" style={{ margin: 0 }}>GDPR Compliance</h3>
                  </div>
                  <p className="text-body">Full GDPR compliance including data deletion on request, consent management, and data portability. EU residents can exercise all data rights.</p>
                </div>
                <div className="card" style={{ padding: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '2rem' }}>💳</span>
                    <h3 className="text-h4" style={{ margin: 0 }}>PCI DSS via Plaid/Stripe</h3>
                  </div>
                  <p className="text-body">PCI DSS compliance handled entirely by Plaid and Stripe. No card numbers are ever stored on Autokkeep infrastructure.</p>
                </div>
                <div className="card" style={{ padding: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '2rem' }}>🗑️</span>
                    <h3 className="text-h4" style={{ margin: 0 }}>Right to Be Forgotten</h3>
                  </div>
                  <p className="text-body">Real account deletion — not just deactivation. When you delete your account, your data is permanently removed from all systems within 30 days.</p>
                </div>
              </div>
            </section>

            {/* Infrastructure */}
            <section className="section-sm">
              <div className="section-header">
                <h2 className="section-title">Infrastructure <span className="text-gradient">Security</span></h2>
                <p className="section-subtitle">
                  Defense in depth — from the database layer to the application layer.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '700px', margin: '0 auto' }}>
                <div className="card" style={{ padding: '24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--success)', fontSize: '1.25rem', flexShrink: 0, marginTop: '2px' }}>✓</span>
                  <div>
                    <h3 className="text-h4" style={{ marginBottom: '4px' }}>PostgreSQL with Row-Level Security</h3>
                    <p className="text-body">20 tables, every query automatically filtered by tenant. No client can ever access another client&apos;s data — enforced at the database level.</p>
                  </div>
                </div>
                <div className="card" style={{ padding: '24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--success)', fontSize: '1.25rem', flexShrink: 0, marginTop: '2px' }}>✓</span>
                  <div>
                    <h3 className="text-h4" style={{ marginBottom: '4px' }}>Period Locking</h3>
                    <p className="text-body">Locked accounting periods cannot be modified — preventing accidental or malicious changes to finalized financial records.</p>
                  </div>
                </div>
                <div className="card" style={{ padding: '24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--success)', fontSize: '1.25rem', flexShrink: 0, marginTop: '2px' }}>✓</span>
                  <div>
                    <h3 className="text-h4" style={{ marginBottom: '4px' }}>Immutable Audit Trail</h3>
                    <p className="text-body">Every action logged with actor, timestamp, and details. Hash-chained entries cannot be modified retroactively.</p>
                  </div>
                </div>
                <div className="card" style={{ padding: '24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--success)', fontSize: '1.25rem', flexShrink: 0, marginTop: '2px' }}>✓</span>
                  <div>
                    <h3 className="text-h4" style={{ marginBottom: '4px' }}>Encrypted Token Storage</h3>
                    <p className="text-body">Supabase Vault for third-party API credentials. Encryption keys managed separately from application code.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* CTA */}
            <div className="cta-section" style={{ padding: '48px 0' }}>
              <h3 className="text-h3" style={{ marginBottom: '12px' }}>
                Questions About Our Security?
              </h3>
              <p className="text-body" style={{ marginBottom: '24px' }}>
                We&apos;re happy to share our security documentation, audit reports, and data processing agreements.
              </p>
              <a href="/contact" className="btn btn-primary btn-lg">
                Contact Our Security Team
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
