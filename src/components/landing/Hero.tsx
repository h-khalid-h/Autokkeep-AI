'use client';

import Image from 'next/image';
import { Button } from '@/components/ui';
import { useLanding } from '@/lib/context/LandingContext';
import { getCountryName } from '@/lib/country';
import { getTaxRules } from '@/lib/tax/rules';
import styles from './Hero.module.css';

const EYEBROWS: Record<string, string> = {
  en: 'AI-Powered Bookkeeping for',
  de: 'KI-gestützte Buchhaltung für',
  fr: "Comptabilité optimisée par l'IA pour",
  pt: 'Contabilidade por IA para',
  es: 'Contabilidad impulsada por IA para',
  ja: '向けのAI仕訳・記帳',
  et: 'AI-toega raamatupidamine riigile',
  ar: 'مسك الدفاتر بالذكاء الاصطناعي لـ',
};

export default function Hero() {
  const { country, language, t } = useLanding();
  const countryName = country === 'Global' ? 'Global' : getCountryName(country);
  const taxRules = country !== 'Global' ? getTaxRules(country) : null;
  
  const getEyebrowText = () => {
    const prefix = EYEBROWS[language] || EYEBROWS.en;
    if (language === 'ja') {
      return `${countryName}${prefix}`;
    }
    return `${prefix} ${countryName}`;
  };

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
          {getEyebrowText()}
        </div>

        <h1 className={styles.title}>
          {t('heroHeading')}
        </h1>

        <p className={styles.subtitle}>
          {t('heroSubheading')}
          {taxRules && (
            <span style={{ display: 'block', marginTop: 'var(--space-2)', fontSize: '0.9em', color: 'var(--color-text-secondary)' }}>
              🎯 {taxRules.taxSystemLabel} — aligned with {taxRules.authority} compliance guidelines ({taxRules.retentionYears}-year audit trail).
            </span>
          )}
        </p>

        <div className={styles.ctas}>
          <Button variant="primary" size="lg" href="/demo/shadow-audit">
            {t('watchDemo')}
          </Button>
          <Button variant="secondary" size="lg" href="/auth/signup">
            {t('startFreeTrial')}
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
