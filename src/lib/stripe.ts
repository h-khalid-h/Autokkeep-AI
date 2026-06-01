import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

/**
 * Returns a Stripe client instance.
 * Throws in production if STRIPE_SECRET_KEY is not set.
 * Returns null in development if key is missing.
 */
export function getStripeClient(): Stripe | null {
  if (stripeInstance) return stripeInstance;
  
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('STRIPE_SECRET_KEY is required in production');
    }
    console.warn('[Stripe] STRIPE_SECRET_KEY not set — billing features disabled');
    return null;
  }
  
  stripeInstance = new Stripe(key, {
    apiVersion: '2026-04-22.dahlia',
    typescript: true,
  });
  
  return stripeInstance;
}

// Plan price IDs — must match Stripe Dashboard price IDs
export const PLAN_PRICES = {
  starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || '',
  growth_monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY || '',
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
} as const;

export type PlanId = keyof typeof PLAN_PRICES;

// Map Stripe plan IDs to SQL subscription_plan enum values
export const PLAN_DB_NAMES: Record<PlanId, string> = {
  starter_monthly: 'starter',
  growth_monthly: 'smb_growth',
  pro_monthly: 'cpa_professional',
} as const;
