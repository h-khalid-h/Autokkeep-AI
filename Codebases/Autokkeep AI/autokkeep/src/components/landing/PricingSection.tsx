'use client';

import { useEffect, useRef, useState } from 'react';

type PricingTrack = 'cpa' | 'smb';

const cpaPricing = [
  {
    tier: 'CPA Partner',
    name: 'Foundation',
    price: 89,
    period: '/ entity / mo',
    description: 'Minimum 10 entities. For boutique firms modernizing data ingestion.',
    features: [
      'Standard GL mapping',
      'Core Bank & Card APIs (Plaid)',
      'Slack/Teams receipt bot',
      'Real-time cash-basis close',
      'Audit trail exports',
      'Unlimited seats',
    ],
    featured: false,
  },
  {
    tier: 'CPA Partner',
    name: 'Scale',
    price: 69,
    period: '/ entity / mo',
    description: 'Minimum 40 entities. For mid-market firms scaling client count.',
    features: [
      'Everything in Foundation',
      'Custom Chart of Accounts per client',
      'Multi-currency ledgers',
      'White-labeled partner portal',
      'Priority API sync',
      'Dedicated onboarding',
    ],
    featured: true,
  },
  {
    tier: 'CPA Partner',
    name: 'Enterprise',
    price: 0,
    period: 'Custom',
    description: '100+ entities. For large accounting networks or BPO providers.',
    features: [
      'Everything in Scale',
      'Dedicated VPC deployment',
      'Custom LLM fine-tuning',
      'Dedicated solutions engineer',
      'SLA-backed uptime guarantee',
      'Custom integration pipelines',
    ],
    featured: false,
  },
];

const smbPricing = [
  {
    tier: 'Direct',
    name: 'Basic',
    price: 249,
    period: '/ month',
    description: 'Up to 500 transactions/mo. For early-stage companies.',
    features: [
      'Real-time AI categorization',
      'Continuous operational cash close',
      'Slack/WhatsApp receipt agent',
      'QuickBooks/Xero sync',
      'Basic audit trail',
      'Unlimited seats',
    ],
    featured: false,
  },
  {
    tier: 'Direct',
    name: 'Growth',
    price: 499,
    period: '/ month',
    description: 'Up to 2,500 transactions/mo. For Series A/B startups & SMBs.',
    features: [
      'Everything in Basic',
      'Multi-entity consolidation',
      'Depreciation scheduling',
      'Priority API sync',
      'Automated audit-trail export',
      '25 HITL credits included',
    ],
    featured: true,
  },
  {
    tier: 'Direct',
    name: 'Premium',
    price: 899,
    period: '/ month',
    description: 'Up to 10,000+ transactions/mo. For complex multi-currency businesses.',
    features: [
      'Everything in Growth',
      'ASC 606 revenue recognition',
      'Custom integration pipelines',
      'Dedicated computing cluster',
      'Advanced accrual engine',
      '50 HITL credits included',
    ],
    featured: false,
  },
];

export default function PricingSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [track, setTrack] = useState<PricingTrack>('cpa');

  const pricing = track === 'cpa' ? cpaPricing : smbPricing;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = sectionRef.current?.querySelectorAll('.animate-on-scroll');
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section className="section" id="pricing" ref={sectionRef}>
      <div className="container">
        <div className="section-header">
          <div className="section-label animate-on-scroll">
            <span>💎</span> Pricing
          </div>
          <h2 className="section-title animate-on-scroll delay-1">
            Value-Based. <span className="text-gradient">Not Seat-Based.</span>
          </h2>
          <p className="section-subtitle animate-on-scroll delay-2">
            We charge based on entities managed and transaction volume — not user seats. The better the AI performs, the more value you get. All plans include unlimited seats.
          </p>
        </div>

        {/* Track Toggle */}
        <div className="pricing-toggle animate-on-scroll delay-2">
          <button
            className={`pricing-toggle-btn ${track === 'cpa' ? 'active' : ''}`}
            onClick={() => setTrack('cpa')}
            aria-pressed={track === 'cpa'}
          >
            🏢 CPA Firm Partners
          </button>
          <button
            className={`pricing-toggle-btn ${track === 'smb' ? 'active' : ''}`}
            onClick={() => setTrack('smb')}
            aria-pressed={track === 'smb'}
          >
            🚀 Direct / SMB
          </button>
        </div>

        {/* Pricing Cards */}
        <div className="pricing-grid">
          {pricing.map((plan) => (
            <div
              key={plan.name}
              className={`pricing-card ${plan.featured ? 'featured' : ''}`}
            >
              <div className="pricing-tier">{plan.tier}</div>
              <h3 className="pricing-name">{plan.name}</h3>
              <div className="pricing-price">
                {plan.price > 0 ? (
                  <>
                    <span className="pricing-amount">${plan.price}</span>
                    <span className="pricing-period">{plan.period}</span>
                  </>
                ) : (
                  <span className="pricing-amount" style={{ fontSize: '1.75rem' }}>Custom</span>
                )}
              </div>
              <p className="pricing-description">{plan.description}</p>

              <div className="pricing-features">
                {plan.features.map((feature) => (
                  <div key={feature} className="pricing-feature">
                    <span className="pricing-feature-icon">✓</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <a
                href={plan.price > 0 ? '#cta' : '/contact'}
                className={`btn ${plan.featured ? 'btn-primary' : 'btn-secondary'} btn-lg`}
                style={{ width: '100%' }}
              >
                {plan.price > 0 ? 'Start Free Pilot' : 'Contact Sales'}
              </a>
            </div>
          ))}
        </div>

        {/* Free pilot callout */}
        <div className="card-accent animate-on-scroll delay-3" style={{
          textAlign: 'center',
          padding: '24px',
          marginTop: '24px',
        }}>
          <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
            🎁 Free Pilot Program — 3 entities free for 60 days. No credit card required.
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Test Autokkeep with your messiest clients. If the AI handles those, you&apos;ll know it handles everything.
          </p>
        </div>
      </div>
    </section>
  );
}
