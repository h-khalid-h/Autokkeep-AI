import { Button } from '@/components/ui';
import styles from './CTASection.module.css';

export default function CTASection() {
  return (
    <section className={styles.section} id="cta">
      <div className={styles.bgAccent}>
        <div className={styles.bgGradient} />
      </div>

      <div className={styles.container}>
        <h2 className={styles.heading}>
          Ready to put your books on{' '}
          <span className={styles.headingGradient}>autopilot?</span>
        </h2>

        <p className={styles.description}>
          Join hundreds of businesses that have eliminated manual bookkeeping.
          Start your free 14-day trial today — no credit card required.
        </p>

        <div className={styles.ctas}>
          <Button variant="primary" size="lg" href="/signup">
            Start Free Trial
          </Button>
          <Button variant="ghost" size="lg" href="/demo/shadow-audit">
            Try the Demo
          </Button>
        </div>
      </div>
    </section>
  );
}
