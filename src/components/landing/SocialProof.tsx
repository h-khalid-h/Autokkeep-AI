'use client';

import { useLanding } from '@/lib/context/LandingContext';
import styles from './SocialProof.module.css';

const STATS = [
  { value: '98.7%', label: 'AI Accuracy' },
  { value: '10K+', label: 'Transactions/day' },
  { value: '3.2s', label: 'Avg. Processing' },
  { value: '40+', label: 'Countries' },
];

export default function SocialProof() {
  const { t } = useLanding();

  return (
    <section className={styles.section} id="social-proof" data-scroll-reveal>
      <div className={styles.container}>
        <p className={styles.trustText}>
          {t('socialProof')}
        </p>

        {/* Stat counters — Glean-inspired metrics */}
        <div className={styles.stats}>
          {STATS.map((stat) => (
            <div key={stat.label} className={styles.stat}>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          ))}
        </div>

        <div className={styles.divider} />
      </div>
    </section>
  );
}
