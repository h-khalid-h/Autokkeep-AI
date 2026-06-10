import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Stripe ────────────────────────────────────────────────────────────────

const { MockStripeConstructor } = vi.hoisted(() => {
  const MockStripeConstructor = vi.fn(function() {
    return { customers: {}, subscriptions: {} };
  });
  return { MockStripeConstructor };
});

vi.mock('stripe', () => ({
  default: MockStripeConstructor,
}));

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('stripe - client initialization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Reset the module to clear singleton
    vi.resetModules();
    MockStripeConstructor.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getStripeClient', () => {
    it('returns a Stripe instance when STRIPE_SECRET_KEY is set', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_abc123';
      const { getStripeClient } = await import('./stripe');
      const client = getStripeClient();
      expect(client).not.toBeNull();
    });

    it('returns the same instance on subsequent calls (singleton)', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_abc123';
      const { getStripeClient } = await import('./stripe');
      const client1 = getStripeClient();
      const client2 = getStripeClient();
      expect(client1).toBe(client2);
    });

    it('passes the correct apiVersion to Stripe constructor', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_xyz789';
      const { getStripeClient } = await import('./stripe');
      getStripeClient();
      expect(MockStripeConstructor).toHaveBeenCalledWith('sk_test_xyz789', {
        apiVersion: '2026-05-27.dahlia',
        typescript: true,
      });
    });

    it('returns null in development when key is missing', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      process.env.NODE_ENV = 'development';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { getStripeClient } = await import('./stripe');
      const client = getStripeClient();
      expect(client).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('STRIPE_SECRET_KEY not set')
      );
      warnSpy.mockRestore();
    });

    it('throws in production when key is missing', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      process.env.NODE_ENV = 'production';
      const { getStripeClient } = await import('./stripe');
      expect(() => getStripeClient()).toThrow('STRIPE_SECRET_KEY is required in production');
    });

    it('logs a warning when key is missing in dev', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      process.env.NODE_ENV = 'development';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { getStripeClient } = await import('./stripe');
      getStripeClient();
      expect(warnSpy).toHaveBeenCalledWith(
        '[Stripe] STRIPE_SECRET_KEY not set — billing features disabled'
      );
      warnSpy.mockRestore();
    });

    it('returns null in test env when key is missing', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      process.env.NODE_ENV = 'test';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { getStripeClient } = await import('./stripe');
      const client = getStripeClient();
      expect(client).toBeNull();
      warnSpy.mockRestore();
    });
  });

  describe('PLAN_PRICES', () => {
    it('has starter_monthly, growth_monthly, and pro_monthly keys', async () => {
      const { PLAN_PRICES } = await import('./stripe');
      expect(PLAN_PRICES).toHaveProperty('starter_monthly');
      expect(PLAN_PRICES).toHaveProperty('growth_monthly');
      expect(PLAN_PRICES).toHaveProperty('pro_monthly');
    });

    it('reads from environment variables', async () => {
      process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter_123';
      process.env.STRIPE_PRICE_GROWTH_MONTHLY = 'price_growth_456';
      process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_789';
      const { PLAN_PRICES } = await import('./stripe');
      expect(PLAN_PRICES.starter_monthly).toBe('price_starter_123');
      expect(PLAN_PRICES.growth_monthly).toBe('price_growth_456');
      expect(PLAN_PRICES.pro_monthly).toBe('price_pro_789');
    });

    it('defaults to empty string when env vars are not set', async () => {
      delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
      delete process.env.STRIPE_PRICE_GROWTH_MONTHLY;
      delete process.env.STRIPE_PRICE_PRO_MONTHLY;
      const { PLAN_PRICES } = await import('./stripe');
      expect(PLAN_PRICES.starter_monthly).toBe('');
      expect(PLAN_PRICES.growth_monthly).toBe('');
      expect(PLAN_PRICES.pro_monthly).toBe('');
    });
  });

  describe('PLAN_DB_NAMES', () => {
    it('maps plan IDs to database subscription_plan enum values', async () => {
      const { PLAN_DB_NAMES } = await import('./stripe');
      expect(PLAN_DB_NAMES).toEqual({
        starter_monthly: 'starter',
        growth_monthly: 'smb_growth',
        pro_monthly: 'cpa_professional',
      });
    });

    it('has matching keys with PLAN_PRICES', async () => {
      const { PLAN_PRICES, PLAN_DB_NAMES } = await import('./stripe');
      const priceKeys = Object.keys(PLAN_PRICES).sort();
      const dbNameKeys = Object.keys(PLAN_DB_NAMES).sort();
      expect(priceKeys).toEqual(dbNameKeys);
    });
  });

  describe('PlanId type', () => {
    it('only allows valid plan keys', async () => {
      const { PLAN_PRICES } = await import('./stripe');
      const validKeys = ['starter_monthly', 'growth_monthly', 'pro_monthly'];
      expect(Object.keys(PLAN_PRICES)).toEqual(expect.arrayContaining(validKeys));
      expect(Object.keys(PLAN_PRICES).length).toBe(3);
    });
  });
});
