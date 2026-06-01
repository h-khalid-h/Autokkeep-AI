'use client';

import { useEffect, useRef } from 'react';

const layers = [
  {
    number: '1',
    title: 'Universal Engine (80%)',
    desc: 'The transaction engine, AI categorization, and analytics layer that powers everything. Bank sync, receipt matching, and intelligent classification happen here — handling the vast majority of your financial data automatically.',
    iconBg: 'arch-node-deterministic',
  },
  {
    number: '2',
    title: 'Accounting Engine',
    desc: 'A configurable Chart of Accounts that adapts to your business. Whether you\'re a freelancer, e-commerce store, or professional services firm, the accounting logic molds to your structure — not the other way around.',
    iconBg: 'arch-node-probabilistic',
  },
  {
    number: '3',
    title: 'Compliance Modules',
    desc: 'Per-country tax rules, reporting requirements, and regulatory plugins. GAAP, sales tax, VAT — compliance is handled through modular extensions so your books are always jurisdiction-ready.',
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
            A <span className="text-gradient">3-Layer</span> Intelligence Platform
          </h2>
          <p className="section-subtitle animate-on-scroll delay-2">
            Built from the ground up to handle the complexity of real-world business finances — with precision at every layer.
          </p>
        </div>

        {/* Architecture Diagram — Flow */}
        <div className="arch-diagram animate-on-scroll delay-2">
          <div className="arch-flow">
            {/* Data Ingestion */}
            <div className="arch-node">
              <div className="arch-node-icon" style={{
                background: 'var(--info-subtle)',
                border: '1px solid rgba(30, 111, 255, 0.25)',
                color: 'var(--info)',
              }}>
                📥
              </div>
              <div className="arch-node-label">Data Ingestion</div>
              <div className="arch-node-sublabel">Banks · Cards · Invoices</div>
            </div>

            <div className="arch-arrow">→</div>

            {/* Deterministic Filter */}
            <div className="arch-node arch-node-deterministic">
              <div className="arch-node-icon">🔒</div>
              <div className="arch-node-label">Deterministic Filter</div>
              <div className="arch-node-sublabel">Known merchants · Rules</div>
            </div>

            <div className="arch-arrow">→</div>

            {/* AI Engine */}
            <div className="arch-node arch-node-probabilistic">
              <div className="arch-node-icon">🧠</div>
              <div className="arch-node-label">AI Engine</div>
              <div className="arch-node-sublabel">LLM categorization · Analysis</div>
            </div>

            <div className="arch-arrow">→</div>

            {/* Insights */}
            <div className="arch-node" style={{ borderColor: 'var(--success-border)' }}>
              <div className="arch-node-icon" style={{
                background: 'var(--success-subtle)',
                border: '1px solid var(--success-border)',
                color: 'var(--success)',
              }}>
                📊
              </div>
              <div className="arch-node-label">Insights</div>
              <div className="arch-node-sublabel">Reports · Alerts · Answers</div>
            </div>
          </div>
        </div>

        {/* Three layers explained */}
        <div className="arch-explanation">
          {layers.map((layer, index) => (
            <div key={layer.title} className={`arch-step animate-on-scroll delay-${index + 1}`}>
              <div className="arch-step-number">{layer.number}</div>
              <h4 className="arch-step-title">{layer.title}</h4>
              <p className="arch-step-desc">{layer.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
