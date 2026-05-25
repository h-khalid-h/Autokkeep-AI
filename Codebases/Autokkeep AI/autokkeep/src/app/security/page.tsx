import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

export const metadata: Metadata = {
  title: 'Security — Autokkeep',
  description: 'How Autokkeep protects your financial data with bank-grade encryption, row-level security, immutable audit trails, and SOC 2 Type II readiness.',
};

const securityLayers = [
  {
    icon: '🔐',
    title: 'Encryption at Rest & In Transit',
    items: [
      'AES-256 encryption for all stored data',
      'TLS 1.3 for all data in transit',
      'Hardware security modules (HSM) for key management',
      'Zero-knowledge architecture for sensitive credentials',
    ],
  },
  {
    icon: '🛡️',
    title: 'Row-Level Security (RLS)',
    items: [
      'Every database query automatically filtered by tenant ID',
      'No client can ever see another client\'s data — enforced at the database level',
      'PostgreSQL RLS policies tested on every deployment',
      'Logical isolation validated through automated security testing',
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
      'SOC 2 Type II — audit readiness from day one',
      'GAAP & IFRS compliant double-entry bookkeeping',
      'GDPR-compliant data processing for EU clients',
      'Annual third-party penetration testing',
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
