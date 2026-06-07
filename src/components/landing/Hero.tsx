'use client';

import Image from 'next/image';
import Link from 'next/link';
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
      {/* Background gradient accents — richer mesh */}
      <div className={styles.bgAccent}>
        <div className={styles.bgGradient1} />
        <div className={styles.bgGradient2} />
        <div className={styles.bgFade} />
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
          {/* Animated gradient CTA (Glean-inspired) */}
          <div className={styles.ctaPrimary}>
            <Link href="/demo/shadow-audit" className={styles.ctaPrimaryInner}>
              <span style={{ position: 'relative', zIndex: 2 }}>{t('watchDemo')}</span>
            </Link>
          </div>
          <Button variant="secondary" size="lg" href="/auth/signup">
            {t('startFreeTrial')}
          </Button>
        </div>
      </div>

      {/* Product mockup with floating UI overlays */}
      <div className={styles.mockupWrapper}>
        <div className={styles.mockupContainer}>
          <Image
            src="/images/hero-dashboard.png"
            alt="Autokkeep dashboard showing real-time transaction categorization and financial insights"
            fill
            className={styles.mockupImage}
            priority
            sizes="(max-width: 768px) 100vw, 1040px"
          />
        </div>

        {/* Floating glassmorphism cards */}
        <div className={styles.floatingCardTop}>
          <div className={styles.floatingCardLabel}>AI Confidence</div>
          <div className={styles.floatingCardValue}>
            <span className={styles.floatingCardIcon}>✨</span>
            98.7%
          </div>
        </div>
        <div className={styles.floatingCardBottom}>
          <div className={styles.floatingCardLabel}>Transactions Processed</div>
          <div className={styles.floatingCardValue}>
            <span className={styles.floatingCardIcon}>📊</span>
            12,847
          </div>
        </div>

        <div className={styles.mockupGlow} />
      </div>
    </section>
  );
}
