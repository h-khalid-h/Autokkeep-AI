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

// Plan price IDs (set these in env vars or Stripe Dashboard)
export const PLAN_PRICES = {
  starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || '',
  professional_monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || '',
} as const;

export type PlanId = keyof typeof PLAN_PRICES;
