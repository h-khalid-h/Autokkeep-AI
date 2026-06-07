'use client';

import { useLanding } from '@/lib/context/LandingContext';
import styles from './HowItWorks.module.css';

const PLAID_COUNTRIES = new Set(['US', 'CA', 'GB', 'IE', 'FR', 'NL', 'DE']);

const LABELS: Record<string, string> = {
  en: 'How It Works',
  de: 'So funktioniert es',
  fr: 'Comment ça marche',
  pt: 'Como Funciona',
  es: 'Cómo funciona',
  ja: '使い方',
  et: 'Kuidas see töötab',
  ar: 'كيف يعمل',
};

const STEP_NUMBERS: Record<string, string[]> = {
  en: ['Step 1', 'Step 2', 'Step 3'],
  de: ['Schritt 1', 'Schritt 2', 'Schritt 3'],
  fr: ['Étape 1', 'Étape 2', 'Étape 3'],
  pt: ['Passo 1', 'Passo 2', 'Passo 3'],
  es: ['Paso 1', 'Paso 2', 'Paso 3'],
  ja: ['ステップ 1', 'ステップ 2', 'ステップ 3'],
  et: ['1. samm', '2. samm', '3. samm'],
  ar: ['الخطوة ١', 'الخطوة ٢', 'الخطوة ٣'],
};

export default function HowItWorks() {
  const { country, language, t } = useLanding();
  const isPlaidSupported = country === 'Global' || PLAID_COUNTRIES.has(country);

  const steps = [
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      ),
      title: t('connectBank'),
      description: isPlaidSupported
        ? t('connectBankDesc')
        : `${t('connectBankDesc')} (Manual statement parsing and CSV uploads are supported in your region).`,
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
      title: t('aiProcess'),
      description: t('aiProcessDesc'),
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
      title: t('approveAdjust'),
      description: t('approveAdjustDesc'),
    },
  ];

  const label = LABELS[language] || LABELS.en;
  const stepNums = STEP_NUMBERS[language] || STEP_NUMBERS.en;

  return (
    <section className={styles.section} id="how-it-works" data-scroll-reveal>
      <div className={styles.container}>
        <p className={styles.label}>{label}</p>
        <h2 className={styles.heading}>{t('howItWorks')}</h2>

        <div className={styles.steps}>
          {steps.map((step, index) => (
            <div key={index} className={styles.step}>
              <div className={styles.stepIcon}>{step.icon}</div>
              <span className={styles.stepNumber}>{stepNums[index]}</span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDesc}>{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
