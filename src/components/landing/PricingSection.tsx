'use client';

import { useEffect, useRef } from 'react';

const pricing = [
  {
    name: 'Starter',
    price: 29,
    period: '/ month',
    description: 'For solopreneurs and early-stage businesses getting their finances organized.',
    features: [
      'Automated bookkeeping',
      'Bank & credit card sync',
      'AI categorization',
      'Basic financial insights',
      '1 entity, 500 txn/month',
      'Unlimited seats',
    ],
    featured: false,
  },
  {
    name: 'Growth',
    price: 99,
    period: '/ month',
    description: 'For growing businesses that need deeper financial intelligence.',
    features: [
      'Everything in Starter',
      'AI Financial Analyst',
      'Cash flow intelligence',
      'Health monitoring alerts',
      'Tax readiness tools',
      '3 entities, 2,500 txn/month',
    ],
    featured: true,
  },
  {
    name: 'Pro',
    price: 299,
    period: '/ month',
    description: 'For established businesses with complex multi-entity operations.',
    features: [
      'Everything in Growth',
      'Multi-entity consolidation',
      'Advanced forecasting',
      'Monthly financial narratives',
      'Accountant collaboration portal',
      'Unlimited entities, 10,000+ txn/month',
      'Priority support',
    ],
    featured: false,
  },
];

export default function PricingSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

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
            Simple Pricing. <span className="text-gradient">Powerful Results.</span>
          </h2>
          <p className="section-subtitle animate-on-scroll delay-2">
            No per-seat charges. No hidden fees. Pick the plan that fits your business size and transaction volume. Upgrade or downgrade anytime.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="pricing-grid">
          {pricing.map((plan) => (
            <div
              key={plan.name}
              className={`pricing-card ${plan.featured ? 'featured' : ''}`}
            >
              {plan.featured && (
                <div style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '4px 16px',
                  background: 'var(--accent-primary)',
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Most Popular
                </div>
              )}
              <h3 className="pricing-name">{plan.name}</h3>
              <div className="pricing-price">
                <span className="pricing-amount">${plan.price}</span>
                <span className="pricing-period">{plan.period}</span>
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
                href="#cta"
                className={`btn ${plan.featured ? 'btn-primary' : 'btn-secondary'} btn-lg`}
                style={{ width: '100%' }}
              >
                Start Free
              </a>
            </div>
          ))}
        </div>

        {/* Free trial callout */}
        <div className="card-accent animate-on-scroll delay-3" style={{
          textAlign: 'center',
          padding: '24px',
          marginTop: '24px',
        }}>
          <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
            🎁 Start free — no credit card required. 14-day trial on any plan.
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Try Autokkeep risk-free. Connect your bank, let the AI categorize your transactions, and see the difference in days — not months.
          </p>
        </div>
      </div>
    </section>
  );
}
