'use client';

import { useEffect, useRef } from 'react';

const problems = [
  {
    icon: '💸',
    metric: 'No visibility',
    title: '"I don\'t know where my money goes"',
    description: 'You\'re too busy running your business to sit down and categorize every transaction. Hundreds of expenses pile up each month with no clear picture of where your revenue actually goes.',
  },
  {
    icon: '📅',
    metric: 'Weeks behind',
    title: '"My books are always behind"',
    description: 'Monthly close takes weeks. By the time your financials are ready, the data is stale — and you\'re making decisions based on numbers that no longer reflect reality.',
  },
  {
    icon: '🤷',
    metric: 'Wait for answers',
    title: '"I can\'t answer basic finance questions"',
    description: '"Are we profitable this quarter?" "What\'s our biggest expense?" Simple questions that require calling your accountant, waiting days, and paying for time you shouldn\'t need.',
  },
  {
    icon: '🚨',
    metric: 'Zero warning',
    title: '"I\'m surprised by cash flow problems"',
    description: 'Duplicate payments, unexpected charges, and cash crunches hit you out of nowhere. Without real-time visibility, every financial surprise is a stressful one.',
  },
];

const stats = [
  { value: '67%', label: 'of small businesses don\'t understand their financial statements' },
  { value: '82%', label: 'of business failures cite cash flow problems' },
  { value: '10hrs', label: 'wasted per month on manual bookkeeping' },
  { value: '15+ days', label: 'average month-end close delay' },
];

export default function ProblemSection() {
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
    <section className="section" id="problem" ref={sectionRef}>
      <div className="container">
        <div className="section-header">
          <div className="section-label animate-on-scroll">
            <span>⚠️</span> The Problem
          </div>
          <h2 className="section-title animate-on-scroll delay-1">
            Small Business Finances Are <span className="text-gradient">Flying Blind</span>
          </h2>
          <p className="section-subtitle animate-on-scroll delay-2">
            You started a business to build something great — not to become a part-time bookkeeper. Yet here you are, drowning in receipts and spreadsheets.
          </p>
        </div>

        <div className="problem-grid">
          {problems.map((problem, index) => (
            <div
              key={problem.title}
              className={`problem-card animate-on-scroll delay-${index + 1}`}
            >
              <div className="problem-icon">{problem.icon}</div>
              <div className="problem-metric">{problem.metric}</div>
              <h3 className="problem-title">{problem.title}</h3>
              <p className="problem-description">{problem.description}</p>
            </div>
          ))}
        </div>

        <div className="stats-bar">
          {stats.map((stat, index) => (
            <div key={stat.label} className={`stat-item animate-on-scroll delay-${index + 1}`}>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
