import { Card } from '@/components/ui';
import styles from './FeaturesGrid.module.css';

const features = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
        <path d="M8 6a4 4 0 0 0 3.25 3.93" />
        <path d="M12 10v2" />
        <path d="M9 14h6" />
        <rect x="7" y="16" width="10" height="5" rx="1" />
      </svg>
    ),
    title: 'AI Categorization',
    description: 'Machine learning classifies every transaction with 98%+ accuracy, learning your unique patterns over time.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M7 15h0M2 9.5h20" />
      </svg>
    ),
    title: 'Receipt Chase',
    description: 'Automatically requests missing receipts from vendors and matches them to transactions.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </svg>
    ),
    title: 'Month-End Close',
    description: 'Reconcile, review, and close your books automatically at the end of every month.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    title: 'Financial Health',
    description: 'Real-time dashboards with cash flow monitoring, burn rate tracking, and anomaly detection.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 15l2 2 4-4" />
      </svg>
    ),
    title: 'Tax Readiness',
    description: 'Stay audit-ready year-round with GAAP-compliant categorization and exportable reports.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="18" rx="2" />
        <path d="M12 3v18M2 12h20" />
      </svg>
    ),
    title: 'Multi-Entity',
    description: 'Manage multiple businesses or subsidiaries from a single dashboard with consolidated views.',
  },
];

export default function FeaturesGrid() {
  return (
    <section className={styles.section} id="features">
      <div className={styles.container}>
        <p className={styles.label}>Features</p>
        <h2 className={styles.heading}>Everything your books need</h2>
        <p className={styles.subheading}>
          From daily transaction categorization to year-end tax prep, Autokkeep handles it all.
        </p>

        <div className={styles.grid}>
          {features.map((feature) => (
            <Card key={feature.title} variant="default" padding="lg" className={styles.featureCard}>
              <div className={styles.featureIcon}>{feature.icon}</div>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDesc}>{feature.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
