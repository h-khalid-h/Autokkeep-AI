'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import Logo from '@/components/ui/Logo';
import styles from './page.module.css';

const LAST_UPDATED = 'May 25, 2026';

const sections = [
  {
    id: 'service-description',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    title: 'Service Description',
    content: [
      {
        subtitle: 'Platform Overview',
        text: 'Autokkeep is an AI-powered financial operations platform that automates transaction categorization, bank reconciliation, financial health monitoring, and reporting for businesses. Our service combines machine learning with deterministic accounting rules to deliver accurate financial management.',
      },
      {
        subtitle: 'Service Availability',
        text: 'We strive to maintain 99.9% uptime availability. However, we reserve the right to perform scheduled maintenance with reasonable advance notice. Unplanned outages may occur due to circumstances beyond our control, and we will make commercially reasonable efforts to restore service promptly.',
      },
      {
        subtitle: 'Beta Features',
        text: 'We may offer beta or experimental features that are provided "as is" without warranty. Beta features may be modified or discontinued at any time. Use of beta features is at your own risk and may be subject to additional terms.',
      },
    ],
  },
  {
    id: 'data-handling',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
    title: 'Data Handling',
    content: [
      {
        subtitle: 'Bank Data',
        text: 'We access your bank transactions through Plaid\'s secure API. Bank credentials are never stored on our servers — they are handled exclusively by Plaid. Transaction data is encrypted in transit and at rest.',
      },
      {
        subtitle: 'Financial Records',
        text: 'Your financial records — including categorized transactions, journal entries, reconciliation data, and generated reports — are stored securely in our database with row-level security. Each organization\'s data is fully isolated.',
      },
      {
        subtitle: 'AI Processing',
        text: 'Transaction descriptions may be sent to OpenAI\'s API for categorization purposes. This data is processed in real-time and is not stored by OpenAI or used for model training, in accordance with their API data usage policy.',
      },
    ],
  },
  {
    id: 'third-party-services',
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
        text: 'We use Plaid to securely connect to your bank accounts. Plaid acts as a secure intermediary for accessing transaction data and does not store your bank login credentials on our behalf. Use of Plaid is subject to the Plaid End User Privacy Policy.',
      },
      {
        subtitle: 'Stripe',
        text: 'Payment processing is handled by Stripe. Your payment card details are transmitted directly to Stripe and never touch our servers. Stripe is PCI DSS Level 1 certified. Use of Stripe is subject to the Stripe Services Agreement.',
      },
      {
        subtitle: 'OpenAI',
        text: 'We use OpenAI\'s API to power our AI categorization and financial insights engine. Data sent to OpenAI is processed under their API data usage policy — it is not stored or used for model training. We send only transaction descriptions, never full account numbers or credentials.',
      },
      {
        subtitle: 'Supabase',
        text: 'Our database and authentication infrastructure is hosted on Supabase, which provides SOC 2 Type II certified PostgreSQL hosting with row-level security, encrypted backups, and real-time monitoring.',
      },
    ],
  },
  {
    id: 'user-responsibilities',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    title: 'User Responsibilities',
    content: [
      {
        subtitle: 'Account Security',
        text: 'You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized access or security breach.',
      },
      {
        subtitle: 'Accurate Information',
        text: 'You agree to provide accurate, current, and complete information during registration and to keep your account information updated. Providing false or misleading information may result in account suspension.',
      },
      {
        subtitle: 'Acceptable Use',
        text: 'You agree not to use the platform for any unlawful purpose, to process fraudulent transactions, to attempt to reverse-engineer our systems, to interfere with platform security, or to use automated scripts to access the service without our written consent.',
      },
      {
        subtitle: 'Financial Oversight',
        text: 'While Autokkeep provides automated financial operations, you remain responsible for the accuracy and completeness of your financial records. We recommend periodic review by a qualified accountant or CPA, particularly for tax filings and regulatory compliance.',
      },
    ],
  },
  {
    id: 'billing',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    title: 'Billing & Payments',
    content: [
      {
        subtitle: 'Subscription Plans',
        text: 'Access to Autokkeep is provided on a subscription basis. Plan details, pricing, and included features are described on our pricing page. We reserve the right to modify pricing with 30 days\' advance notice to existing subscribers.',
      },
      {
        subtitle: 'Payment Terms',
        text: 'Subscription fees are billed in advance on a monthly or annual basis depending on your selected plan. All fees are non-refundable except as required by law or as explicitly stated in our refund policy.',
      },
      {
        subtitle: 'Failed Payments',
        text: 'If a payment fails, we will attempt to process it up to three additional times over 14 days. If payment cannot be collected, your account may be downgraded or suspended. You will be notified before any account changes.',
      },
      {
        subtitle: 'Taxes',
        text: 'All prices are exclusive of applicable taxes unless stated otherwise. You are responsible for any sales tax, VAT, or other taxes applicable in your jurisdiction.',
      },
    ],
  },
  {
    id: 'data-ownership',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: 'Data Ownership & Intellectual Property',
    content: [
      {
        subtitle: 'Your Data',
        text: 'You retain all ownership rights to the financial data, documents, and records you upload or generate through the platform. We do not claim ownership of your data and will not access it except as necessary to provide the service.',
      },
      {
        subtitle: 'License to Use',
        text: 'By using the platform, you grant Autokkeep a limited, non-exclusive license to process your data solely for the purpose of providing the financial operations service. This license terminates when you delete your data or close your account.',
      },
      {
        subtitle: 'Our Intellectual Property',
        text: 'The Autokkeep platform, including its software, algorithms, AI models, design, branding, and documentation, is the intellectual property of Autokkeep and is protected by copyright, trademark, and other intellectual property laws.',
      },
      {
        subtitle: 'Data Export',
        text: 'You may export your data at any time in standard formats (CSV, PDF, QBO). Upon account termination, you will have 30 days to export your data before it is permanently deleted from our systems.',
      },
    ],
  },
  {
    id: 'liability',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    title: 'Limitation of Liability',
    content: [
      {
        subtitle: 'Service Warranty',
        text: 'The platform is provided "as is" and "as available" without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, or non-infringement.',
      },
      {
        subtitle: 'AI-Generated Content',
        text: 'While our AI strives for accuracy, automated categorizations and financial insights may contain errors. Autokkeep is not liable for losses resulting from reliance on AI-generated output without independent verification.',
      },
      {
        subtitle: 'Liability Cap',
        text: 'To the maximum extent permitted by law, Autokkeep\'s total liability to you shall not exceed the amount paid by you in the twelve (12) months preceding the claim. This limitation applies to all causes of action, whether in contract, tort, or otherwise.',
      },
      {
        subtitle: 'Exclusions',
        text: 'In no event shall Autokkeep be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, regardless of whether we were advised of the possibility of such damages.',
      },
    ],
  },
  {
    id: 'termination',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    title: 'Termination',
    content: [
      {
        subtitle: 'Termination by You',
        text: 'You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of your current billing period. You will retain access to the service until then.',
      },
      {
        subtitle: 'Termination by Us',
        text: 'We may suspend or terminate your account if you violate these terms, engage in fraudulent activity, fail to make required payments, or if we are required to do so by law. We will provide reasonable notice when possible.',
      },
      {
        subtitle: 'Effect of Termination',
        text: 'Upon termination, your right to use the platform ceases immediately. You will have 30 days to export your data. After this period, your data will be permanently deleted, except where retention is required by applicable law.',
      },
    ],
  },
  {
    id: 'governing-law',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: 'Governing Law & Disputes',
    content: [
      {
        subtitle: 'Governing Law',
        text: 'These terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions.',
      },
      {
        subtitle: 'Dispute Resolution',
        text: 'Any disputes arising from or relating to these terms shall first be attempted to be resolved through good-faith negotiation. If unresolved within 30 days, disputes shall be submitted to binding arbitration under the rules of the American Arbitration Association.',
      },
      {
        subtitle: 'Class Action Waiver',
        text: 'You agree that any dispute resolution proceedings will be conducted on an individual basis and not in a class, consolidated, or representative action. You waive any right to participate in class action lawsuits or class-wide arbitration.',
      },
      {
        subtitle: 'Changes to Terms',
        text: 'We may update these terms from time to time. Material changes will be communicated via email or in-app notification at least 30 days before taking effect. Continued use of the service after changes take effect constitutes acceptance of the updated terms.',
      },
    ],
  },
];

export default function TermsPage() {
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
      <nav className={styles.navbar}>
        <Link href="/" className={styles.logoLink}>
          <Logo size={32} />
          <span className={styles.logoText}>
            Autokkeep
          </span>
        </Link>
        <div className={styles.navActions}>
          <Link href="/privacy" className={styles.navLink}>
            Privacy Policy
          </Link>
          <Link
            href="/auth/login"
            className={`btn btn-primary btn-sm ${styles.signInLink}`}
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero Header */}
      <div className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Legal
          </div>
          <h1 className={`text-h1 ${styles.heroTitle}`}>
            Terms of Service
          </h1>
          <p className={`text-body-lg ${styles.heroSubtitle}`}>
            Please read these terms carefully before using Autokkeep. By accessing or using our platform, you agree to be bound by these terms.
          </p>
          <p className={`text-caption ${styles.heroDate}`}>
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className={`container ${styles.mainGrid}`}>
        {/* Sidebar Nav */}
        <nav className={styles.sidebar}>
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={`${styles.sidebarLink} ${activeSection === section.id ? styles.sidebarLinkActive : ''}`}
            >
              {section.title}
            </a>
          ))}
        </nav>

        {/* Content */}
        <div className={styles.contentColumn}>
          {/* Agreement Notice */}
          <div className={styles.agreementNotice}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--warning)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.warningIcon}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p className={styles.agreementText}>
              By creating an account or using the Autokkeep platform, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service and our{' '}
              <Link href="/privacy" className={styles.privacyLink}>
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className={styles.sectionCard}
            >
              {/* Section Header */}
              <div className={styles.sectionHeader}>
                <div className={styles.sectionIcon}>
                  {section.icon}
                </div>
                <h2 className={`text-h3 ${styles.sectionTitle}`}>
                  {section.title}
                </h2>
              </div>

              {/* Content Items */}
              <div className={styles.contentItems}>
                {section.content.map((item, i) => (
                  <div key={i} className={styles.contentItem}>
                    <h3 className={`text-h4 ${styles.contentItemTitle}`}>
                      {item.subtitle}
                    </h3>
                    <p className={styles.contentItemText}>
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* Contact Section */}
          <section className={styles.contactSection}>
            <h2 className={`text-h3 ${styles.contactTitle}`}>
              Questions about these terms?
            </h2>
            <p className={styles.contactText}>
              If you have any questions about these Terms of Service or need clarification on any provision, our legal team is here to help.
            </p>
            <a
              href="mailto:legal@autokkeep.com"
              className={`btn btn-primary ${styles.contactLink}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              legal@autokkeep.com
            </a>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <div className={styles.footerBrand}>
            <Logo size={28} />
            <span className={styles.footerCopy}>
              © {new Date().getFullYear()} Autokkeep. All rights reserved.
            </span>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/" className={styles.footerLink}>
              Home
            </Link>
            <Link href="/terms" className={styles.footerLinkActive}>
              Terms of Service
            </Link>
            <Link href="/privacy" className={styles.footerLink}>
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
