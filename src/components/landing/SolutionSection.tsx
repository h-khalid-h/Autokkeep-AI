'use client';

import { useEffect, useRef, useState } from 'react';
import Logo from '@/components/ui/Logo';

const solutions = [
  {
    icon: '🤖',
    title: 'AI Bookkeeping',
    description: 'Bank sync, categorization, receipt matching — all automatic. Connect your accounts once, and Autokkeep continuously keeps your books accurate and up-to-date without any manual effort.',
    tag: 'Eliminates manual data entry',
  },
  {
    icon: '💬',
    title: 'AI Financial Analyst',
    description: 'Ask any question about your finances in plain English. "Why are expenses up?" "Am I profitable this quarter?" Get instant, data-backed answers without waiting for your accountant.',
    tag: 'Answers in seconds, not days',
  },
  {
    icon: '🛡️',
    title: 'Financial Health Monitoring',
    description: 'AI watches for anomalies, duplicate payments, unusual charges, and cash flow issues 24/7. Get proactive alerts before small problems become expensive surprises.',
    tag: 'Real-time anomaly detection',
  },
  {
    icon: '📊',
    title: 'AI Month-End Close',
    description: 'Reconciliation, missing receipt detection, and profitability summaries — automated. What used to take weeks now happens continuously, with a clean review ready when you need it.',
    tag: 'Continuous close, not monthly panic',
  },
  {
    icon: '📋',
    title: 'Tax Readiness',
    description: 'Automatic deduction detection, expense organization by tax category, and a complete audit trail. When tax season arrives, you\'re already prepared — no scrambling required.',
    tag: 'Always audit-ready',
  },
];

const chatMessages = [
  {
    role: 'user' as const,
    text: 'Why are expenses higher this month?',
  },
  {
    role: 'assistant' as const,
    text: 'Software expenses increased $640 (42%) due to 3 new subscriptions: Figma ($45/mo), Linear ($10/mo), and Vercel Pro ($20/mo). Your total software spend is now $2,167/mo — the highest in 6 months. Want me to break down all subscription costs? 📊',
  },
];

export default function SolutionSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [showResponse, setShowResponse] = useState(false);

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
    <section className="section" id="solution" ref={sectionRef}>
      <div className="container">
        <div className="section-header">
          <div className="section-label animate-on-scroll">
            <span>🚀</span> The Solution
          </div>
          <h2 className="section-title animate-on-scroll delay-1">
            Your Complete AI <span className="text-gradient">Finance Team</span>
          </h2>
          <p className="section-subtitle animate-on-scroll delay-2">
            Five intelligent modules working together to give you financial clarity, control, and confidence — without the complexity.
          </p>
        </div>

        <div className="solution-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {solutions.map((solution, index) => (
            <div
              key={solution.title}
              className={`solution-card animate-on-scroll delay-${Math.min(index + 1, 4)}`}
            >
              <div className="solution-icon">{solution.icon}</div>
              <h3 className="solution-title">{solution.title}</h3>
              <p className="solution-description">{solution.description}</p>
              <div className="solution-tag">
                <span>✓</span> {solution.tag}
              </div>
            </div>
          ))}
        </div>

        {/* AI Chat Mockup */}
        <div className="animate-on-scroll delay-2">
          <div className="section-header" style={{ marginBottom: '32px' }}>
            <h3 className="text-h3">See It In Action</h3>
            <p className="section-subtitle">Ask your finances anything — get instant, intelligent answers</p>
          </div>

          <div className="slack-mockup">
            <div className="slack-header">
              <Logo size={36} />
              <div>
                <div className="slack-name">
                  Autokkeep AI <span className="slack-badge-bot">AI</span>
                </div>
                <div className="text-caption">Financial Assistant</div>
              </div>
            </div>
            <div className="slack-body">
              {/* User message */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '16px',
              }}>
                <div style={{
                  padding: '12px 16px',
                  background: 'var(--accent-primary)',
                  borderRadius: '16px 16px 4px 16px',
                  fontSize: '0.9375rem',
                  color: '#fff',
                  maxWidth: '80%',
                }}>
                  {chatMessages[0].text}
                </div>
              </div>

              {/* AI response */}
              {!showResponse ? (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <button
                    onClick={() => setShowResponse(true)}
                    style={{
                      padding: '12px 20px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '16px 16px 16px 4px',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    aria-label="Show AI response"
                  >
                    <span style={{ fontSize: '1.25rem' }}>🤖</span>
                    Click to see Autokkeep&apos;s response...
                  </button>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-start',
                  animation: 'slide-up-fade 0.3s ease forwards',
                }}>
                  <div style={{
                    padding: '16px 20px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '16px 16px 16px 4px',
                    fontSize: '0.9375rem',
                    color: 'var(--text-primary)',
                    maxWidth: '85%',
                    lineHeight: 1.6,
                  }}>
                    {chatMessages[1].text}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
