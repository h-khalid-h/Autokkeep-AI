'use client';

import { useEffect, useRef, useState } from 'react';

const solutions = [
  {
    icon: '💬',
    title: 'Zero-Chase Receipt Agent',
    description: 'The moment a corporate card is swiped, Autokkeep pings the employee via Slack, Teams, or WhatsApp with a sandboxed interactive card. Receipts are captured at the point of sale — no chasing, no nagging, no delays.',
    tag: 'Eliminates 95% of receipt chasing',
  },
  {
    icon: '🧠',
    title: 'Dual-Engine AI Categorization',
    description: 'Recurring transactions hit our deterministic engine — zero AI cost, 100% accuracy. Novel expenses route through our fine-tuned financial LLM with confidence scoring. The AI proposes; your rules decide.',
    tag: '60% of transactions at zero AI cost',
  },
  {
    icon: '📊',
    title: 'Continuous Operational Close',
    description: 'Cash, expenses, and vendor bills reconcile in real-time. Your P&L and cash flow are accurate to the hour. Period-end accruals get a structured review wizard — honest about what needs human judgment.',
    tag: 'Real-time financial clarity',
  },
];

export default function SolutionSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

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
            A System of <span className="text-gradient">Action</span>, Not Record
          </h2>
          <p className="section-subtitle animate-on-scroll delay-2">
            Autokkeep doesn&apos;t wait for you to tell it what to do. It actively hunts down missing data, categorizes with context, and keeps your ledger permanently audit-ready.
          </p>
        </div>

        <div className="solution-grid">
          {solutions.map((solution, index) => (
            <div
              key={solution.title}
              className={`solution-card animate-on-scroll delay-${index + 1}`}
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

        {/* Slack Mockup */}
        <div className="animate-on-scroll delay-2">
          <div className="section-header" style={{ marginBottom: '32px' }}>
            <h3 className="text-h3">See It In Action</h3>
            <p className="section-subtitle">How Autokkeep captures receipts without the chase</p>
          </div>

          <div className="slack-mockup">
            <div className="slack-header">
              <div className="slack-avatar">AK</div>
              <div>
                <div className="slack-name">
                  Autokkeep Agent <span className="slack-badge-bot">BOT</span>
                </div>
                <div className="text-caption">#expenses</div>
              </div>
            </div>
            <div className="slack-body">
              <div className="slack-message">
                Hey <strong>@Sarah</strong> 👋 — detected a <strong>$42.50</strong> transaction at <strong>Blue Bottle Coffee</strong> on your card ending in 7712.
              </div>
              <div className="slack-options">
                <button
                  className={`slack-option ${selectedOption === 0 ? 'selected' : ''}`}
                  onClick={() => setSelectedOption(0)}
                  aria-label="Categorize as Client Meeting"
                >
                  <span className="slack-option-radio" />
                  <span>☕ Client Meeting → <em>Business Meals & Entertainment</em></span>
                </button>
                <button
                  className={`slack-option ${selectedOption === 1 ? 'selected' : ''}`}
                  onClick={() => setSelectedOption(1)}
                  aria-label="Categorize as Team Lunch"
                >
                  <span className="slack-option-radio" />
                  <span>🍕 Team Lunch → <em>Employee Welfare</em></span>
                </button>
                <button
                  className={`slack-option ${selectedOption === 2 ? 'selected' : ''}`}
                  onClick={() => setSelectedOption(2)}
                  aria-label="Upload receipt"
                >
                  <span className="slack-option-radio" />
                  <span>📎 Upload Receipt — <em>Drop file here</em></span>
                </button>
              </div>
              {selectedOption !== null && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  color: 'hsl(142, 71%, 45%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  animation: 'slide-up-fade 0.3s ease forwards',
                }}>
                  <span>✓</span> Got it! Transaction categorized and matched to bank feed. No further action needed.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
