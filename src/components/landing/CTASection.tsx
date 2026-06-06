'use client';

import { Button } from '@/components/ui';
import { useLanding } from '@/lib/context/LandingContext';
import styles from './CTASection.module.css';

export default function CTASection() {
  const { t } = useLanding();

  return (
    <section className={styles.section} id="cta">
      <div className={styles.bgAccent}>
        <div className={styles.bgGradient} />
      </div>

      <div className={styles.container}>
        <h2 className={styles.heading}>
          {t('ctaHeading')}
        </h2>

        <p className={styles.description}>
          {t('ctaSubheading')}
        </p>

        <div className={styles.ctas}>
          <Button variant="primary" size="lg" href="/auth/signup">
            {t('startFreeTrial')}
          </Button>
          <Button variant="ghost" size="lg" href="/demo/shadow-audit">
            {t('watchDemo')}
          </Button>
        </div>
      </div>
    </section>
  );
}
