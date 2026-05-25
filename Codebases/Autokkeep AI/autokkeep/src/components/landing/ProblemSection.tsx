'use client';

import { useEffect, useRef } from 'react';

const problems = [
  {
    icon: '📬',
    metric: '3+ hrs/week',
    title: 'The Receipt Chase',
    description: 'Finance teams waste hours pinging employees for missing receipts and invoices. Every corporate card swipe triggers a multi-week game of telephone that nobody wants to play.',
  },
  {
    icon: '📅',
    metric: '15 days',
    title: 'The Close Delay',
    description: 'Books are closed weeks after the month ends. Leaders make strategic decisions using financial data that\'s already expired — flying blind with stale numbers.',
  },
  {
    icon: '⚙️',
    metric: '60% break rate',
    title: 'Rule-Based Fragility',
    description: 'Traditional "if/then" bank rules break the moment a vendor changes their invoice format, amount varies, or a transaction doesn\'t match perfectly. Constant maintenance.',
  },
  {
    icon: '🔍',
    metric: 'Zero context',
    title: 'The Context Gap',
    description: 'Software knows where money was spent, but never why. A $1,200 charge to "TX-CORP-98821" could be anything. Human intervention is always required for edge cases.',
  },
];

const stats = [
  { value: '$4.6B+', label: 'Unbillable CPA labor annually' },
  { value: '300K', label: 'Accountants left the profession' },
  { value: '73 days', label: 'Average time to fill CPA roles' },
  { value: '30%', label: 'Decline in CPA exam candidates' },
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
            Why Today&apos;s Bookkeeping <span className="text-gradient">is Broken</span>
          </h2>
          <p className="section-subtitle animate-on-scroll delay-2">
            Despite cloud accounting software, businesses are still trapped in a loop of manual pain points that cost billions annually.
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
