'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import Logo from '@/components/ui/Logo';

const LAST_UPDATED = 'May 25, 2026';

const sections = [
  {
    id: 'data-collection',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    title: 'Data Collection',
    content: [
      {
        subtitle: 'Information You Provide',
        text: 'When you create an account, we collect your name, email address, company information, and billing details. If you contact us for support, we may also collect information included in your correspondence.',
      },
      {
        subtitle: 'Financial Data',
        text: 'To provide our financial operations services, we access your financial data through secure integrations, including bank transactions, invoices, receipts, and accounting records. This data is essential for our core service functionality.',
      },
      {
        subtitle: 'Automatically Collected Data',
        text: 'We automatically collect device information, browser type, IP address, usage patterns, and interaction data when you use our platform. This helps us improve performance and user experience.',
      },
    ],
  },
  {
    id: 'data-usage',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    ),
    title: 'How We Use Your Data',
    content: [
      {
        subtitle: 'Service Delivery',
        text: 'We use your financial data to perform automated transaction categorization, generate reports, reconcile accounts, monitor financial health, and provide AI-driven financial insights.',
      },
      {
        subtitle: 'Service Improvement',
        text: 'Your financial data is never used to train external AI models. Our AI processes your data in real-time for categorization only — it is not stored by our AI provider (OpenAI) and is not used for model training. We may use aggregated, fully anonymized usage metrics (e.g., categorization accuracy rates) to improve our internal algorithms.',
      },
      {
        subtitle: 'Communication',
        text: 'We use your contact information to send service notifications, billing updates, security alerts, and — with your consent — product updates and educational content.',
      },
      {
        subtitle: 'AI Chat Conversations',
        text: 'When you use the AI Financial Analyst chat feature, your conversation history is stored to maintain context across sessions and improve response quality. This data is associated with your account and entity. You can delete conversation history at any time through the Insights page.',
      },
      {
        subtitle: 'Financial Health Alerts',
        text: 'Our AI Health Monitoring system generates alerts about anomalies, duplicate payments, and cash flow changes. These alerts and their associated metadata are stored in your account to provide historical tracking and audit trails.',
      },
    ],
  },
  {
    id: 'third-party',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    title: 'Third-Party Services',
    content: [
      {
        subtitle: 'Plaid',
        text: 'We use Plaid to securely connect to your bank accounts and retrieve transaction data. Plaid acts as an intermediary and does not store your bank credentials. Their data practices are governed by the Plaid Privacy Policy.',
      },
      {
        subtitle: 'Stripe',
        text: 'Payment processing is handled by Stripe. Your payment card details are transmitted directly to Stripe and are never stored on our servers. Stripe is PCI DSS Level 1 certified, the highest level of security compliance.',
      },
      {
        subtitle: 'OpenAI',
        text: 'We use OpenAI\'s API to power our AI financial operations features, including transaction categorization, financial health monitoring, and conversational financial insights. Data sent to OpenAI is processed per their API data usage policy and is not used to train their models.',
      },
    ],
  },
  {
    id: 'data-retention',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: 'Data Retention',
    content: [
      {
        subtitle: 'Active Accounts',
        text: 'We retain your data for as long as your account is active and as needed to provide you services. Financial records are retained in accordance with applicable tax and accounting regulations (typically 7 years).',
      },
      {
        subtitle: 'Account Deletion',
        text: 'Upon account deletion request, we will remove your personal data within 30 days, except where retention is required by law. Anonymized, aggregated data that cannot be linked back to you may be retained indefinitely.',
      },
      {
        subtitle: 'Backup Retention',
        text: 'Encrypted backup copies of data may persist in our backup systems for up to 90 days after deletion before being permanently removed through our automated purge process.',
      },
    ],
  },
  {
    id: 'user-rights',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'Your Rights (GDPR & CCPA)',
    content: [
      {
        subtitle: 'Access & Portability',
        text: 'You have the right to request a copy of your personal data in a structured, commonly used format. We will provide this within 30 days of a verified request.',
      },
      {
        subtitle: 'Correction & Deletion',
        text: 'You can request correction of inaccurate data or deletion of your personal data. Certain data may be retained where required by law or for legitimate business purposes.',
      },
      {
        subtitle: 'Opt-Out Rights',
        text: 'You may opt out of marketing communications at any time. California residents have the right to opt out of the "sale" of personal information — note that Autokkeep does not sell personal data to third parties.',
      },
      {
        subtitle: 'Data Processing Objection',
        text: 'EU/EEA residents may object to data processing based on legitimate interests. You may also request restriction of processing while we verify the legitimacy of your objection.',
      },
    ],
  },
  {
    id: 'cookies',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
        <path d="M8.5 8.5v.01" />
        <path d="M16 15.5v.01" />
        <path d="M12 12v.01" />
        <path d="M11 17v.01" />
        <path d="M7 14v.01" />
      </svg>
    ),
    title: 'Cookies & Tracking',
    content: [
      {
        subtitle: 'Essential Cookies',
        text: 'We use essential cookies to maintain your session, remember your preferences, and ensure the platform functions correctly. These cannot be disabled.',
      },
      {
        subtitle: 'Analytics Cookies',
        text: 'With your consent, we use analytics cookies to understand how users interact with our platform. This data is aggregated and used to improve the user experience.',
      },
      {
        subtitle: 'Managing Cookies',
        text: 'You can manage cookie preferences through your browser settings or our cookie consent banner. Disabling non-essential cookies will not affect the core functionality of the platform.',
      },
    ],
  },
  {
    id: 'children',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Children's Privacy",
    content: [
      {
        subtitle: 'Age Restriction',
        text: 'Autokkeep is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children. If you are under 18, please do not use the platform or provide any personal data.',
      },
      {
        subtitle: 'Parental Notice',
        text: 'If we become aware that we have inadvertently collected personal data from a child under 18, we will take immediate steps to delete such information from our servers. If you believe a child has provided us with personal data, please contact our privacy team.',
      },
    ],
  },
  {
    id: 'policy-changes',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    title: 'Changes to This Policy',
    content: [
      {
        subtitle: 'Notification of Changes',
        text: 'We may update this Privacy Policy from time to time to reflect changes in our practices, technologies, or legal requirements. Material changes will be communicated via email or a prominent notice on our platform at least 30 days before taking effect.',
      },
      {
        subtitle: 'Continued Use',
        text: 'Your continued use of the platform after the effective date of any updated Privacy Policy constitutes your acceptance of the revised terms. We encourage you to review this policy periodically to stay informed about how we protect your information.',
      },
    ],
  },
  {
    id: 'security',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: 'Security Measures',
    content: [
      {
        subtitle: 'Encryption',
        text: 'All data is encrypted in transit using TLS 1.3 and at rest using AES-256 encryption. Database connections are secured with SSL certificates and rotated regularly.',
      },
      {
        subtitle: 'Infrastructure',
        text: 'Our infrastructure is hosted on SOC 2 Type II certified cloud providers with redundant backups, DDoS protection, and 24/7 monitoring. We conduct regular penetration testing and vulnerability assessments.',
      },
      {
        subtitle: 'Access Controls',
        text: 'We implement role-based access controls, multi-factor authentication for all internal systems, and maintain detailed audit logs. Employee access to customer data is strictly limited on a need-to-know basis.',
      },
      {
        subtitle: 'Incident Response',
        text: 'In the event of a data breach, we will notify affected users and relevant authorities within 72 hours as required by GDPR. Our incident response team follows established protocols to contain and remediate security events.',
      },
    ],
  },
];

export default function PrivacyPage() {
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Navbar */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          background: 'rgba(10, 14, 26, 0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-primary)',
          zIndex: 1000,
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            textDecoration: 'none',
          }}
        >
          <Logo size={32} />
          <span
            style={{
              fontSize: '18px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            Autokkeep
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <Link
            href="/terms"
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            Terms of Service
          </Link>
          <Link
            href="/auth/login"
            className="btn btn-primary btn-sm"
            style={{ textDecoration: 'none' }}
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero Header */}
      <div
        style={{
          paddingTop: '140px',
          paddingBottom: '64px',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              radial-gradient(ellipse at 50% 0%, rgba(30, 111, 255, 0.08) 0%, transparent 60%)
            `,
            zIndex: 0,
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 16px',
              background: 'var(--accent-subtle)',
              border: '1px solid var(--border-accent)',
              borderRadius: '9999px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--accent-primary)',
              marginBottom: '24px',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Legal
          </div>
          <h1 className="text-h1" style={{ marginBottom: '16px' }}>
            Privacy Policy
          </h1>
          <p
            className="text-body-lg"
            style={{
              maxWidth: '600px',
              margin: '0 auto 16px',
            }}
          >
            Your privacy is fundamental to how we build Autokkeep. This policy explains how we collect, use, and protect your information.
          </p>
          <p className="text-caption" style={{ color: 'var(--text-tertiary)' }}>
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div
        className="container"
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          gap: '48px',
          paddingBottom: '96px',
          alignItems: 'start',
        }}
        id="privacy-grid"
      >
        {/* Sidebar Nav */}
        <nav
          style={{
            position: 'sticky',
            top: '96px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
          className="privacy-sidebar"
        >
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              style={{
                fontSize: '13px',
                fontWeight: activeSection === section.id ? 600 : 400,
                color: activeSection === section.id ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                textDecoration: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                borderLeft: activeSection === section.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                background: activeSection === section.id ? 'var(--accent-subtle)' : 'transparent',
                transition: 'all 0.2s ease',
              }}
            >
              {section.title}
            </a>
          ))}
        </nav>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border-primary)',
                borderRadius: '16px',
                padding: '32px',
                transition: 'border-color 0.3s ease',
              }}
            >
              {/* Section Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '24px',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'var(--accent-subtle)',
                    border: '1px solid var(--border-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-primary)',
                    flexShrink: 0,
                  }}
                >
                  {section.icon}
                </div>
                <h2 className="text-h3" style={{ margin: 0 }}>
                  {section.title}
                </h2>
              </div>

              {/* Content Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {section.content.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      paddingLeft: '20px',
                      borderLeft: '2px solid var(--border-primary)',
                    }}
                  >
                    <h3
                      className="text-h4"
                      style={{
                        marginBottom: '8px',
                        fontSize: '15px',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {item.subtitle}
                    </h3>
                    <p
                      style={{
                        fontSize: '14px',
                        lineHeight: '1.7',
                        color: 'var(--text-secondary)',
                        margin: 0,
                      }}
                    >
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* Contact Section */}
          <section
            style={{
              background: 'var(--accent-subtle)',
              border: '1px solid var(--border-accent)',
              borderRadius: '16px',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <h2 className="text-h3" style={{ marginBottom: '12px' }}>
              Questions about your privacy?
            </h2>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                lineHeight: '1.7',
                maxWidth: '500px',
                margin: '0 auto 24px',
              }}
            >
              If you have any questions about this Privacy Policy or wish to exercise your data rights, please contact our Data Protection team.
            </p>
            <a
              href="mailto:privacy@autokkeep.com"
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              privacy@autokkeep.com
            </a>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-primary)',
          padding: '48px 0',
          background: 'var(--bg-secondary)',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Logo size={28} />
            <span
              style={{
                fontSize: '14px',
                color: 'var(--text-tertiary)',
              }}
            >
              © {new Date().getFullYear()} Autokkeep. All rights reserved.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '32px' }}>
            <Link
              href="/"
              style={{
                fontSize: '14px',
                color: 'var(--text-tertiary)',
                textDecoration: 'none',
                transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
            >
              Home
            </Link>
            <Link
              href="/terms"
              style={{
                fontSize: '14px',
                color: 'var(--text-tertiary)',
                textDecoration: 'none',
                transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
            >
              Terms of Service
            </Link>
            <Link
              href="/privacy"
              style={{
                fontSize: '14px',
                color: 'var(--accent-primary)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          #privacy-grid {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
          .privacy-sidebar {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
