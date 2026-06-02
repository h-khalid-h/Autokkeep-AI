import styles from './HowItWorks.module.css';

const steps = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
    number: 'Step 1',
    title: 'Connect Your Bank',
    description: 'Link your bank accounts securely through Plaid. Your credentials never touch our servers.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
        <path d="M8 6a4 4 0 0 0 3.25 3.93" />
        <path d="M12 10v2" />
        <path d="M9 14h6" />
        <rect x="7" y="16" width="10" height="5" rx="1" />
        <path d="M10 16v5M14 16v5" />
      </svg>
    ),
    number: 'Step 2',
    title: 'AI Categorizes Automatically',
    description: 'Our AI engine learns your patterns and categorizes every transaction with 98%+ accuracy.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    number: 'Step 3',
    title: 'Review Only Exceptions',
    description: 'You only see transactions that need human judgment. Everything else is handled for you.',
  },
];

export default function HowItWorks() {
  return (
    <section className={styles.section} id="how-it-works">
      <div className={styles.container}>
        <p className={styles.label}>How It Works</p>
        <h2 className={styles.heading}>Three steps to automated books</h2>

        <div className={styles.steps}>
          {steps.map((step) => (
            <div key={step.number} className={styles.step}>
              <div className={styles.stepIcon}>{step.icon}</div>
              <span className={styles.stepNumber}>{step.number}</span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDesc}>{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
