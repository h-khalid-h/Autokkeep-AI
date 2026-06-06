'use client';

import { useLanding } from '@/lib/context/LandingContext';
import styles from './SocialProof.module.css';

export default function SocialProof() {
  const { t } = useLanding();

  return (
    <section className={styles.section} id="social-proof">
      <div className={styles.container}>
        <p className={styles.trustText}>
          {t('socialProof')}
        </p>
        <div className={styles.divider} />
      </div>
    </section>
  );
}
