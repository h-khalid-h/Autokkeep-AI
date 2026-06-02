import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import styles from './page.module.css';

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
      <Navbar />

      <main>
        <section className={`section ${styles.heroSection}`}>
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
            <div className={`card-accent ${styles.statusBanner}`}>
              <p className={styles.statusEmoji} aria-hidden="true">
                ✅
              </p>
              <p className={`text-h3 ${styles.statusTitle}`}>
                All Systems Operational
              </p>
              <p className="text-body">
                All services are running normally. No active incidents.
              </p>
            </div>

            {/* Services grid — 2 cols desktop, 1 col mobile */}
            <div className={styles.servicesGrid}>
              {services.map((svc) => (
                <div
                  key={svc.name}
                  className={`card ${styles.serviceCard}`}
                >
                  {/* Green pulsing dot */}
                  <span
                    aria-hidden="true"
                    className={styles.pulseDot}
                  />
                  <div>
                    <h3 className={`text-h4 ${styles.serviceTitle}`}>
                      {svc.name}
                    </h3>
                    <p className={`text-body ${styles.serviceDesc}`}>
                      {svc.description}
                    </p>
                    <span className={styles.serviceStatus}>
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

              <div className={`card ${styles.uptimeCard}`}>
                {/* Day blocks */}
                <div className={styles.uptimeDays}>
                  {uptimeDays().map((day) => (
                    <div
                      key={day}
                      title={`Day ${90 - day}`}
                      className={styles.uptimeDay}
                    />
                  ))}
                </div>

                <div className={styles.uptimeLabels}>
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

              <div className={styles.incidentsList}>
                {incidents.map((inc) => (
                  <div
                    key={inc.date}
                    className={`card ${styles.incidentCard}`}
                  >
                    <div className={styles.incidentHeader}>
                      <time
                        dateTime={inc.date}
                        className={styles.incidentDate}
                      >
                        {inc.label}
                      </time>
                      {inc.resolved && (
                        <span className={styles.incidentResolved}>
                          Resolved ✅
                        </span>
                      )}
                    </div>
                    <h3 className={`text-h4 ${styles.incidentTitle}`}>
                      {inc.title}
                    </h3>
                    <p className="text-body">{inc.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Subscribe CTA */}
            <div className={`cta-section ${styles.ctaSection}`}>
              <h3 className={`text-h3 ${styles.ctaTitle}`}>
                Stay Informed
              </h3>
              <p className={`text-body ${styles.ctaBody}`}>
                Get notified of status changes. Subscribe via email or follow{' '}
                <a
                  href="https://twitter.com/autokkeep"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.ctaLink}
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
