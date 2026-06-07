import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Changelog — Autokkeep',
  description: 'Stay up to date with the latest Autokkeep AI platform updates, new features, security improvements, and performance enhancements.',
};

const changelogEntries = [
  {
    version: 'v2.2.0',
    date: 'June 1, 2026',
    dateISO: '2026-06-01',
    changes: [
      '🏗️ EasyPanel deployment refinement — self-hosted Docker optimization',
      '🤖 Auto-categorization cron: transactions categorized every 15 minutes',
      '🔄 Ledger auto-push: approved transactions sync to QuickBooks/Xero every 30 min',
      '🔑 OAuth token refresh cron prevents silent authentication failures',
      '🌍 Compliance plugins for 5 regions: Estonia, Qatar, Hong Kong, Japan, India',
      '👨‍💼 Admin dashboard with organization management and system health',
      '📧 Enhanced email templates: bank sync alerts, token expiry, month-end reminders',
      '🔒 CSP fix for self-hosted Supabase on EasyPanel',
    ],
  },
  {
    version: 'v2.1.0',
    date: 'June 1, 2026',
    dateISO: '2026-06-01',
    changes: [
      '🔒 Deep logic review: 64 security and reliability fixes across the codebase',
      '🛡️ Audit log made immutable for SOC 2 compliance',
      '⚡ OpenAI API calls now have 30s timeout with automatic retries',
      '🏗️ Stripe webhook idempotency protection',
      '🔐 OAuth redirect validation against allowlist',
      '📊 Health alert deduplication prevents duplicate notifications',
    ],
  },
  {
    version: 'v2.0.0',
    date: 'May 30, 2026',
    dateISO: '2026-05-30',
    changes: [
      '🚀 Complete platform transformation — AI-first financial operations',
      '🤖 Dual-engine categorization: deterministic rules + GPT-4o probabilistic',
      '💬 Multi-channel receipt chase (Slack, Teams, SMS, WhatsApp, Email)',
      '📗 QuickBooks & Xero ledger sync with OAuth',
      '🏦 Plaid bank connection with AES-256 token encryption',
      '📊 Financial health monitoring with 8 automated checks',
      '🔄 Month-end close automation engine',
      '🌍 Multi-currency support with real-time conversion',
    ],
  },
  {
    version: 'v1.5.0',
    date: 'May 15, 2026',
    dateISO: '2026-05-15',
    changes: [
      '📋 Chart of Accounts management with bulk import',
      '📈 Analytics dashboard with real-time KPIs',
      '🏢 Multi-entity portfolio management',
      '🌐 Region/timezone/currency localization',
    ],
  },
  {
    version: 'v1.0.0',
    date: 'April 2026',
    dateISO: '2026-04-01',
    changes: [
      '🎉 Initial launch — AI-powered bookkeeping platform',
      '🔑 Authentication with Supabase Auth',
      '💳 Stripe billing integration (Starter, Growth, Pro plans)',
      '📱 Responsive design with dark mode',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <Navbar />
      <main>
        <section className={`section ${styles.section}`} data-scroll-reveal>
          <div className="container">
            <div className="section-header">
              <div className="section-label">
                <span>📝</span> Changelog
              </div>
              <h1 className="section-title">
                What&apos;s New in <span className="text-gradient">Autokkeep</span>
              </h1>
              <p className="section-subtitle">
                Every improvement, feature, and fix — documented transparently. We ship fast and we ship safely.
              </p>
            </div>

            {/* Changelog Entries */}
            <div className={styles.entriesList}>
              {changelogEntries.map((entry) => (
                <article
                  key={entry.version}
                  className={`card ${styles.entryCard}`}
                >
                  <div className={styles.entryHeader}>
                    <span className={styles.versionBadge}>
                      {entry.version}
                    </span>
                    <time
                      dateTime={entry.dateISO}
                      className={styles.entryDate}
                    >
                      {entry.date}
                    </time>
                  </div>
                  <ul className={styles.changesList}>
                    {entry.changes.map((change) => (
                      <li
                        key={change}
                        className={`text-body ${styles.changeItem}`}
                      >
                        {change}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

            {/* Subscribe CTA */}
            <div className={`cta-section ${styles.ctaSection}`}>
              <p className={`text-body ${styles.ctaText}`}>
                Subscribe to our changelog via RSS or follow us on Twitter for updates.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
