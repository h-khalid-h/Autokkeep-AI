import Image from 'next/image';
import { Button } from '@/components/ui';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <section className={styles.hero} id="hero">
      {/* Background gradient accents */}
      <div className={styles.bgAccent}>
        <div className={styles.bgGradient1} />
        <div className={styles.bgGradient2} />
      </div>

      {/* Text content */}
      <div className={styles.content}>
        <div className={styles.eyebrow}>
          <span aria-hidden="true">⚡</span>
          AI-Powered Bookkeeping
        </div>

        <h1 className={styles.title}>
          Your AI{' '}
          <span className={styles.titleGradient}>Bookkeeper</span>
        </h1>

        <p className={styles.subtitle}>
          Autokkeep autonomously categorizes transactions, chases receipts, and closes your books
          every month — so you can focus on growing your business.
        </p>

        <div className={styles.ctas}>
          <Button variant="primary" size="lg" href="/demo/shadow-audit">
            Try the Shadow Audit
          </Button>
          <Button variant="secondary" size="lg" href="/signup">
            Start Free Trial
          </Button>
        </div>
      </div>

      {/* Product mockup */}
      <div className={styles.mockupWrapper}>
        <div className={styles.mockupContainer}>
          <Image
            src="/images/hero-dashboard.png"
            alt="Autokkeep dashboard showing real-time transaction categorization and financial insights"
            fill
            className={styles.mockupImage}
            priority
            sizes="(max-width: 768px) 100vw, 960px"
          />
        </div>
        <div className={styles.mockupGlow} />
      </div>
    </section>
  );
}
