'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const metrics = [
  { value: 95, suffix: '%+', label: 'AI Accuracy', sublabel: 'On known merchants' },
  { value: 10, suffix: 'hrs/mo', label: 'Time Saved', sublabel: 'Average per business' },
  { value: 24, suffix: 'hrs', label: 'Close Time', sublabel: 'Month-end close' },
  { value: 60, suffix: '%', label: 'Cost Savings', sublabel: 'vs traditional bookkeeping' },
];

const trustBadges = [
  { icon: '🏦', label: 'Bank-Grade Encryption' },
  { icon: '🔐', label: 'SOC 2 Ready' },
  { icon: '🌍', label: 'Multi-Currency' },
  { icon: '📋', label: 'GAAP Compliant' },
];

function AnimatedCounter({ target, suffix, duration = 2000 }: { target: number; suffix: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const startAnimation = useCallback(() => {
    if (hasStarted) return;
    setHasStarted(true);
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Number((eased * target).toFixed(target % 1 === 0 ? 0 : 1)));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [target, duration, hasStarted]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            startAnimation();
          }
        });
      },
      { threshold: 0.5 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [startAnimation]);

  return (
    <div ref={ref} className="metric-value">
      {suffix === 'hrs' ? '<' : ''}{target >= 10 ? Math.round(count) : count}{suffix}
    </div>
  );
}

export default function MetricsSection() {
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
    <section className="section-sm" id="metrics" ref={sectionRef}>
      <div className="container">
        <div className="section-header" style={{ marginBottom: '48px' }}>
          <div className="section-label animate-on-scroll">
            <span>📊</span> By The Numbers
          </div>
          <h2 className="section-title animate-on-scroll delay-1">
            Results That <span className="text-gradient">Speak for Themselves</span>
          </h2>
        </div>

        <div className="metrics-grid">
          {metrics.map((metric, index) => (
            <div key={metric.label} className={`metric-card animate-on-scroll delay-${index + 1}`}>
              <AnimatedCounter target={metric.value} suffix={metric.suffix} />
              <div className="metric-label">{metric.label}</div>
              <div className="metric-sublabel">{metric.sublabel}</div>
            </div>
          ))}
        </div>

        <div className="trust-badges animate-on-scroll delay-3">
          {trustBadges.map((badge) => (
            <div key={badge.label} className="trust-badge">
              <div className="trust-badge-icon">{badge.icon}</div>
              <span>{badge.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
