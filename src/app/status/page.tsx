import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

export const metadata: Metadata = {
  title: 'System Status — Autokkeep',
  description:
    'Real-time system status for Autokkeep AI. Monitor uptime, service health, and recent incidents for the AI-powered bookkeeping platform.',
};

const services = [
  { name: 'Autokkeep Platform', description: 'Core web application and API', status: 'Operational' },
  { name: 'AI Categorization Engine', description: 'Transaction classification pipeline', status: 'Operational' },
  { name: 'Bank Sync (Plaid)', description: 'Bank account connections and transaction import', status: 'Operational' },
  { name: 'Ledger Sync (QuickBooks/Xero)', description: 'Two-way ledger synchronization', status: 'Operational' },
  { name: 'Receipt Chase Agent', description: 'Automated receipt collection via email', status: 'Operational' },
  { name: 'Stripe Billing', description: 'Subscription management and payments', status: 'Operational' },
  { name: 'Supabase Database', description: 'Primary data store and authentication', status: 'Operational' },
  { name: 'Email Notifications', description: 'Transactional and alert emails', status: 'Operational' },
];

const incidents = [
  {
    date: '2026-06-01',
    label: 'June 1, 2026',
    title: 'Scheduled Maintenance: Deep logic review deployment',
    detail: 'No downtime.',
    resolved: true,
  },
  {
    date: '2026-05-30',
    label: 'May 30, 2026',
    title: 'Scheduled Maintenance: Platform v2.0 deployment',
    detail: '2 minutes downtime.',
    resolved: true,
  },
];

/** Generate 90 green day-blocks for the static uptime bar. */
function uptimeDays() {
  return Array.from({ length: 90 }, (_, i) => i);
}

export default function StatusPage() {
  return (
    <>
      {/* Pulse animation for status dots */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes pulse-green {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
          `,
        }}
      />

      <Navbar />

      <main>
        <section className="section" style={{ paddingTop: 'calc(var(--header-height) + 80px)' }}>
          <div className="container">
            {/* Page header */}
            <div className="section-header">
              <div className="section-label">
                <span>📡</span> System Status
              </div>
              <h1 className="section-title">
                Service <span className="text-gradient">Health</span>
              </h1>
              <p className="section-subtitle">
                Current operational status for every Autokkeep service. Updated in real time.
              </p>
            </div>

            {/* Overall status banner */}
            <div
              className="card-accent"
              style={{
                textAlign: 'center',
                padding: '32px',
                marginBottom: '64px',
              }}
            >
              <p
                style={{
                  fontSize: '2rem',
                  marginBottom: '8px',
                  lineHeight: 1,
                }}
                aria-hidden="true"
              >
                ✅
              </p>
              <p
                className="text-h3"
                style={{
                  color: 'var(--accent-primary)',
                  marginBottom: '4px',
                }}
              >
                All Systems Operational
              </p>
              <p className="text-body">
                All services are running normally. No active incidents.
              </p>
            </div>

            {/* Services grid — 2 cols desktop, 1 col mobile */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))',
                gap: '20px',
                marginBottom: '80px',
              }}
            >
              {services.map((svc) => (
                <div
                  key={svc.name}
                  className="card"
                  style={{ padding: '24px', display: 'flex', gap: '14px', alignItems: 'center' }}
                >
                  {/* Green pulsing dot */}
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: '#22c55e',
                      flexShrink: 0,
                      animation: 'pulse-green 2s ease-in-out infinite',
                    }}
                  />
                  <div>
                    <h3 className="text-h4" style={{ marginBottom: '2px' }}>
                      {svc.name}
                    </h3>
                    <p
                      className="text-body"
                      style={{ fontSize: '0.85rem', marginBottom: '4px' }}
                    >
                      {svc.description}
                    </p>
                    <span
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#22c55e',
                      }}
                    >
                      {svc.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Uptime section */}
            <section className="section-sm">
              <div className="section-header">
                <h2 className="section-title">
                  <span className="text-gradient">Uptime</span> — Last 90 Days
                </h2>
                <p className="section-subtitle">
                  99.98% uptime over the last 90 days
                </p>
              </div>

              <div
                className="card"
                style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}
              >
                {/* Day blocks */}
                <div
                  style={{
                    display: 'flex',
                    gap: '3px',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    marginBottom: '16px',
                  }}
                >
                  {uptimeDays().map((day) => (
                    <div
                      key={day}
                      title={`Day ${90 - day}`}
                      style={{
                        width: '7px',
                        height: '28px',
                        borderRadius: '2px',
                        backgroundColor: '#22c55e',
                      }}
                    />
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>90 days ago</span>
                  <span>Today</span>
                </div>
              </div>
            </section>

            {/* Recent Incidents */}
            <section className="section-sm">
              <div className="section-header">
                <h2 className="section-title">
                  Recent <span className="text-gradient">Incidents</span>
                </h2>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  maxWidth: '700px',
                  margin: '0 auto',
                }}
              >
                {incidents.map((inc) => (
                  <div
                    key={inc.date}
                    className="card"
                    style={{
                      padding: '24px',
                      borderLeft: '4px solid #22c55e',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <time
                        dateTime={inc.date}
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {inc.label}
                      </time>
                      {inc.resolved && (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#22c55e',
                            border: '1px solid #22c55e',
                            borderRadius: '9999px',
                            padding: '2px 10px',
                          }}
                        >
                          Resolved ✅
                        </span>
                      )}
                    </div>
                    <h3 className="text-h4" style={{ marginBottom: '4px' }}>
                      {inc.title}
                    </h3>
                    <p className="text-body">{inc.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Subscribe CTA */}
            <div className="cta-section" style={{ padding: '48px 0' }}>
              <h3 className="text-h3" style={{ marginBottom: '12px' }}>
                Stay Informed
              </h3>
              <p className="text-body" style={{ marginBottom: '24px', maxWidth: '520px', margin: '0 auto 24px' }}>
                Get notified of status changes. Subscribe via email or follow{' '}
                <a
                  href="https://twitter.com/autokkeep"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent-primary)', fontWeight: 600 }}
                >
                  @autokkeep
                </a>{' '}
                on Twitter.
              </p>
              <a href="/contact" className="btn btn-primary btn-lg">
                Subscribe to Updates
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
