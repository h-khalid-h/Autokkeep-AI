'use client';

import { useEffect, useRef } from 'react';

const beforeAfter = [
  {
    before: '3 hours/week on bookkeeping',
    after: '30 minutes/month reviewing',
  },
  {
    before: '15-day month-end close',
    after: 'Continuous close — always current',
  },
  {
    before: 'Wait for accountant to explain',
    after: 'Ask AI instantly, get answers now',
  },
  {
    before: 'Surprised by cash flow problems',
    after: 'Proactive alerts before issues hit',
  },
];

export default function BusinessOwnerSection() {
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
    <section className="section" id="cpa" ref={sectionRef}>
      <div className="container">
        <div className="section-header">
          <div className="section-label animate-on-scroll">
            <span>🏢</span> For Business Owners
          </div>
          <h2 className="section-title animate-on-scroll delay-1">
            Built for Business Owners, <span className="text-gradient">Not Accountants</span>
          </h2>
          <p className="section-subtitle animate-on-scroll delay-2">
            Understand your finances without understanding accounting. Autokkeep translates complex financial data into clear, actionable insights you can actually use.
          </p>
        </div>

        <div className="cpa-section">
          <div className="animate-on-scroll">
            <h3 className="text-h3" style={{ marginBottom: '16px' }}>
              Reclaim your time. Understand your money.
            </h3>
            <p className="text-body-lg" style={{ marginBottom: '12px' }}>
              You didn&apos;t start your business to become a bookkeeper. Yet you spend hours every week categorizing transactions, chasing receipts, and trying to understand financial reports that feel like they&apos;re written in another language.
            </p>
            <p className="text-body" style={{ marginBottom: '16px' }}>
              Autokkeep changes that. It handles the bookkeeping automatically, monitors your financial health in real-time, and answers your questions in plain English — so you can focus on what you do best: running your business.
            </p>

            <div className="cpa-metric-grid">
              <div className="cpa-metric">
                <div className="cpa-metric-value">10hrs</div>
                <div className="cpa-metric-label">Saved per month on average</div>
              </div>
              <div className="cpa-metric">
                <div className="cpa-metric-value">95%+</div>
                <div className="cpa-metric-label">AI categorization accuracy</div>
              </div>
              <div className="cpa-metric">
                <div className="cpa-metric-value">60%</div>
                <div className="cpa-metric-label">Cost savings vs traditional</div>
              </div>
              <div className="cpa-metric">
                <div className="cpa-metric-value">$0</div>
                <div className="cpa-metric-label">Per-seat charges (unlimited)</div>
              </div>
            </div>
          </div>

          <div className="cpa-visual animate-on-scroll delay-2">
            <div className="cpa-comparison">
              <div className="cpa-comparison-card before">
                <div className="cpa-comparison-label">❌ Before Autokkeep</div>
                <div className="cpa-comparison-items">
                  {beforeAfter.map((item) => (
                    <div key={item.before} className="cpa-comparison-item">
                      <span>•</span> {item.before}
                    </div>
                  ))}
                  <div className="cpa-comparison-item">
                    <span>•</span> No real-time financial visibility
                  </div>
                </div>
              </div>

              <div className="cpa-comparison-card after">
                <div className="cpa-comparison-label">✅ With Autokkeep</div>
                <div className="cpa-comparison-items">
                  {beforeAfter.map((item) => (
                    <div key={item.after} className="cpa-comparison-item">
                      <span>•</span> {item.after}
                    </div>
                  ))}
                  <div className="cpa-comparison-item">
                    <span>•</span> Complete financial clarity, always
                  </div>
                </div>
              </div>
            </div>

            {/* Testimonial placeholder */}
            <div style={{
              marginTop: '32px',
              padding: '24px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-primary)',
              borderRadius: '12px',
              borderLeft: '4px solid var(--accent-primary)',
            }}>
              <p style={{
                fontSize: '1rem',
                lineHeight: 1.6,
                color: 'var(--text-primary)',
                fontStyle: 'italic',
                marginBottom: '12px',
              }}>
                &ldquo;I used to spend every Sunday afternoon doing bookkeeping. Now I just glance at my Autokkeep dashboard on Monday morning and everything is already done. It&apos;s like having a CFO that never sleeps.&rdquo;
              </p>
              <p style={{
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
                fontWeight: 600,
              }}>
                — Coming soon: real customer testimonials
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
