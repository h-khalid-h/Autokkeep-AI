'use client';

import { Button, Card } from '@/components/ui';
import { useLanding } from '@/lib/context/LandingContext';
import styles from './PricingSection.module.css';

interface PricingTier {
  name: string;
  priceKey: 'starter' | 'growth' | 'pro';
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  ctaLabel: string;
  ctaVariant: 'primary' | 'secondary';
}

const tiers: PricingTier[] = [
  {
    name: 'Starter',
    priceKey: 'starter',
    period: '/mo',
    description: 'For freelancers and sole proprietors getting started.',
    features: [
      'Up to 500 transactions/mo',
      'AI categorization',
      '1 bank connection',
      'Basic financial reports',
      'Email support',
    ],
    ctaLabel: 'Start Free Trial',
    ctaVariant: 'secondary',
  },
  {
    name: 'Growth',
    priceKey: 'growth',
    period: '/mo',
    description: 'For growing businesses that need full automation.',
    features: [
      'Up to 5,000 transactions/mo',
      'AI categorization + receipt chase',
      'Unlimited bank connections',
      'Month-end auto-close',
      'Financial health dashboard',
      'Priority support',
    ],
    popular: true,
    ctaLabel: 'Start Free Trial',
    ctaVariant: 'primary',
  },
  {
    name: 'Pro',
    priceKey: 'pro',
    period: '/mo',
    description: 'For firms and multi-entity businesses at scale.',
    features: [
      'Unlimited transactions',
      'Everything in Growth',
      'Multi-entity management',
      'Tax readiness reports',
      'Custom rules engine',
      'Dedicated account manager',
      'API access',
    ],
    ctaLabel: 'Contact Sales',
    ctaVariant: 'secondary',
  },
];

const LOCAL_PRICING: Record<string, { currencySymbol: string; currency: string; starter: number; growth: number; pro: number }> = {
  US: { currencySymbol: '$', currency: 'USD', starter: 29, growth: 79, pro: 299 },
  CA: { currencySymbol: '$', currency: 'CAD', starter: 39, growth: 109, pro: 399 },
  GB: { currencySymbol: '£', currency: 'GBP', starter: 25, growth: 69, pro: 249 },
  DE: { currencySymbol: '€', currency: 'EUR', starter: 27, growth: 75, pro: 279 },
  FR: { currencySymbol: '€', currency: 'EUR', starter: 27, growth: 75, pro: 279 },
  NL: { currencySymbol: '€', currency: 'EUR', starter: 27, growth: 75, pro: 279 },
  IE: { currencySymbol: '€', currency: 'EUR', starter: 27, growth: 75, pro: 279 },
  EE: { currencySymbol: '€', currency: 'EUR', starter: 27, growth: 75, pro: 279 },
  AE: { currencySymbol: 'AED ', currency: 'AED', starter: 109, growth: 289, pro: 1099 },
  AU: { currencySymbol: '$', currency: 'AUD', starter: 39, growth: 109, pro: 399 },
  IN: { currencySymbol: '₹', currency: 'INR', starter: 2499, growth: 6499, pro: 24999 },
  JP: { currencySymbol: '¥', currency: 'JPY', starter: 4500, growth: 12000, pro: 45000 },
  BR: { currencySymbol: 'R$', currency: 'BRL', starter: 149, growth: 399, pro: 1499 },
  MX: { currencySymbol: '$', currency: 'MXN', starter: 599, growth: 1599, pro: 5999 },
};

export default function PricingSection() {
  const { country } = useLanding();
  const pricing = LOCAL_PRICING[country] || LOCAL_PRICING.US;

  return (
    <section className={styles.section} id="pricing">
      <div className={styles.container}>
        <p className={styles.label}>Pricing</p>
        <h2 className={styles.heading}>Simple, transparent pricing</h2>
        <p className={styles.subheading}>
          Start free for 14 days. No credit card required. Showed in {pricing.currency}.
        </p>

        <div className={styles.tiers}>
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              variant="default"
              padding="lg"
              className={`${styles.tierCard} ${tier.popular ? styles.popular : ''}`}
            >
              {tier.popular && (
                <span className={styles.popularBadge}>Most Popular</span>
              )}

              <h3 className={styles.tierName}>{tier.name}</h3>

              <div className={styles.tierPrice}>
                <span className={styles.priceAmount}>
                  {pricing.currencySymbol}
                  {pricing[tier.priceKey]}
                </span>
                <span className={styles.pricePeriod}>{tier.period}</span>
              </div>

              <p className={styles.tierDesc}>{tier.description}</p>

              <div className={styles.tierDivider} />

              <ul className={styles.featureList}>
                {tier.features.map((feature) => (
                  <li key={feature} className={styles.featureItem}>
                    <span className={styles.featureCheck} aria-hidden="true">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <div className={styles.tierCta}>
                <Button
                  variant={tier.ctaVariant}
                  size="md"
                  href="/auth/signup"
                  className={styles.tierCtaButton}
                >
                  {tier.ctaLabel}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
