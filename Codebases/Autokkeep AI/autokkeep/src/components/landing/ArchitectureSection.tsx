'use client';

import { useEffect, useRef } from 'react';

const steps = [
  {
    number: '1',
    title: 'Deterministic Filter',
    desc: 'Recurring transactions (AWS, Slack, rent) hit an exact-match engine. Zero AI cost, 100% accuracy. Handles 60% of volume.',
    iconBg: 'arch-node-deterministic',
  },
  {
    number: '2',
    title: 'Contextual AI Engine',
    desc: 'Novel transactions route through our fine-tuned financial LLM. Reads invoices, cross-references patterns, assigns a confidence score.',
    iconBg: 'arch-node-probabilistic',
  },
  {
    number: '3',
    title: 'Human-in-the-Loop',
    desc: 'Anything below 95% confidence bypasses the ledger entirely. Flagged for human review on a purpose-built exception dashboard.',
    iconBg: 'arch-node-hitl',
  },
];

export default function ArchitectureSection() {
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
    <section className="section" id="architecture" ref={sectionRef}>
      <div className="container">
        <div className="section-header">
          <div className="section-label animate-on-scroll">
            <span>⚙️</span> How It Works
          </div>
          <h2 className="section-title animate-on-scroll delay-1">
            The <span className="text-gradient">Dual-Engine</span> Architecture
          </h2>
          <p className="section-subtitle animate-on-scroll delay-2">
            We don&apos;t let AI write directly to your ledger. Every transaction passes through a strict validation pipeline that merges the speed of AI with the safety of deterministic code.
          </p>
        </div>

        {/* Architecture Diagram */}
        <div className="arch-diagram animate-on-scroll delay-2">
          <div className="arch-flow">
            {/* Ingestion */}
            <div className="arch-node">
              <div className="arch-node-icon" style={{
                background: 'var(--info-subtle)',
                border: '1px solid rgba(14, 165, 233, 0.25)',
                color: 'var(--info)',
              }}>
                📥
              </div>
              <div className="arch-node-label">Data Ingestion</div>
              <div className="arch-node-sublabel">Bank APIs · Invoices · Receipts</div>
            </div>

            <div className="arch-arrow">→</div>

            {/* Deterministic */}
            <div className="arch-node arch-node-deterministic">
              <div className="arch-node-icon">🔒</div>
              <div className="arch-node-label">Deterministic Filter</div>
              <div className="arch-node-sublabel">Exact match · Zero token cost</div>
            </div>

            <div className="arch-arrow">→</div>

            {/* Decision point */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
              {/* Top path - auto sync */}
              <div className="arch-node arch-node-output" style={{ minWidth: '160px' }}>
                <div className="arch-node-icon">✓</div>
                <div className="arch-node-label">Auto-Sync</div>
                <div className="arch-node-sublabel">100% confidence</div>
              </div>

              <div style={{
                fontSize: '0.75rem',
                color: 'var(--text-tertiary)',
                padding: '4px 12px',
                background: 'var(--bg-elevated)',
                borderRadius: '12px',
              }}>
                No match? ↓
              </div>

              {/* Bottom path - AI */}
              <div className="arch-node arch-node-probabilistic" style={{ minWidth: '160px' }}>
                <div className="arch-node-icon">🧠</div>
                <div className="arch-node-label">AI Engine</div>
                <div className="arch-node-sublabel">LLM + confidence scoring</div>
              </div>
            </div>

            <div className="arch-arrow">→</div>

            {/* Output */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
              <div className="arch-node" style={{ minWidth: '160px', borderColor: 'var(--success-border)' }}>
                <div className="arch-node-icon" style={{
                  background: 'var(--success-subtle)',
                  border: '1px solid var(--success-border)',
                  color: 'var(--success)',
                }}>
                  📊
                </div>
                <div className="arch-node-label">&gt;95% → Ledger</div>
                <div className="arch-node-sublabel">Autonomous commit</div>
              </div>

              <div className="arch-node arch-node-hitl" style={{ minWidth: '160px' }}>
                <div className="arch-node-icon">👤</div>
                <div className="arch-node-label">&lt;95% → HITL</div>
                <div className="arch-node-sublabel">Human review dashboard</div>
              </div>
            </div>
          </div>
        </div>

        {/* Three steps */}
        <div className="arch-explanation">
          {steps.map((step, index) => (
            <div key={step.title} className={`arch-step animate-on-scroll delay-${index + 1}`}>
              <div className="arch-step-number">{step.number}</div>
              <h4 className="arch-step-title">{step.title}</h4>
              <p className="arch-step-desc">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
