import { Button, Card } from '@/components/ui';
import styles from './PricingSection.module.css';

interface PricingTier {
  name: string;
  price: number;
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
    price: 29,
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
    price: 79,
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
    price: 299,
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

export default function PricingSection() {
  return (
    <section className={styles.section} id="pricing">
      <div className={styles.container}>
        <p className={styles.label}>Pricing</p>
        <h2 className={styles.heading}>Simple, transparent pricing</h2>
        <p className={styles.subheading}>
          Start free for 14 days. No credit card required.
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
                <span className={styles.priceAmount}>${tier.price}</span>
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
                 
                  href="/signup"
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
