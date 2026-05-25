'use client';

import { useEffect, useRef } from 'react';

export default function CPASection() {
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
            <span>🦸</span> For CPA Firms
          </div>
          <h2 className="section-title animate-on-scroll delay-1">
            The CPA&apos;s <span className="text-gradient">Iron Man Suit</span>
          </h2>
          <p className="section-subtitle animate-on-scroll delay-2">
            We don&apos;t replace accountants. We give them superpowers. One accountant can now manage 4× more clients without compromising compliance.
          </p>
        </div>

        <div className="cpa-section">
          <div className="animate-on-scroll">
            <h3 className="text-h3" style={{ marginBottom: '16px' }}>
              Turn 15-hour workflows into 30-minute reviews
            </h3>
            <p className="text-body-lg" style={{ marginBottom: '12px' }}>
              Your junior bookkeepers spend 80% of their time typing data and chasing clients for receipts. Autokkeep automates the entire data pipeline — from card swipe to categorized ledger entry — so your team focuses on advisory work that actually generates revenue.
            </p>
            <p className="text-body" style={{ marginBottom: '16px' }}>
              One CPA firm partnership brings us 50 to 500 business entities overnight. That&apos;s not a feature request — it&apos;s a growth engine.
            </p>

            <div className="cpa-metric-grid">
              <div className="cpa-metric">
                <div className="cpa-metric-value">4×</div>
                <div className="cpa-metric-label">Client capacity per accountant</div>
              </div>
              <div className="cpa-metric">
                <div className="cpa-metric-value">83%</div>
                <div className="cpa-metric-label">Reduction in data entry time</div>
              </div>
              <div className="cpa-metric">
                <div className="cpa-metric-value">&lt;5%</div>
                <div className="cpa-metric-label">Human override rate</div>
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
                <div className="cpa-comparison-label">❌ Without Autokkeep</div>
                <div className="cpa-comparison-items">
                  <div className="cpa-comparison-item">
                    <span>•</span> 15 hours/month per client on data entry
                  </div>
                  <div className="cpa-comparison-item">
                    <span>•</span> 3+ hours chasing receipts per week
                  </div>
                  <div className="cpa-comparison-item">
                    <span>•</span> Books closed 15 days after month-end
                  </div>
                  <div className="cpa-comparison-item">
                    <span>•</span> 50 clients max per accountant
                  </div>
                  <div className="cpa-comparison-item">
                    <span>•</span> High junior bookkeeper turnover
                  </div>
                </div>
              </div>

              <div className="cpa-comparison-card after">
                <div className="cpa-comparison-label">✅ With Autokkeep</div>
                <div className="cpa-comparison-items">
                  <div className="cpa-comparison-item">
                    <span>•</span> 30-minute review session per client
                  </div>
                  <div className="cpa-comparison-item">
                    <span>•</span> Zero receipt chasing (Slack bot handles it)
                  </div>
                  <div className="cpa-comparison-item">
                    <span>•</span> Continuous operational close — real-time data
                  </div>
                  <div className="cpa-comparison-item">
                    <span>•</span> 200+ clients per accountant
                  </div>
                  <div className="cpa-comparison-item">
                    <span>•</span> Team focuses on advisory, not data entry
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
