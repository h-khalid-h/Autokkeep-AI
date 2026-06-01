import { describe, it, expect, vi } from 'vitest';
import { PLANS, checkPlanLimits } from './plans';
import type { PlanTier } from './plans';

// ============================================
// Mock Redis — avoid dynamic import issues
// ============================================
vi.mock('@/lib/redis', () => ({
  getRedisClient: () => ({
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    decr: vi.fn().mockResolvedValue(0),
  }),
}));

// ============================================
// Supabase mock factory
// ============================================
/* eslint-disable @typescript-eslint/no-explicit-any */
function createMockSupabase(overrides: {
  subscription?: { plan: PlanTier; status: string } | null;
  entityCount?: number;
  transactionCount?: number;
  bankConnectionCount?: number;
  teamMemberCount?: number;
  entities?: { id: string }[];
} = {}) {
  const {
    subscription = { plan: 'starter' as PlanTier, status: 'active' },
    entityCount = 0,
    transactionCount = 0,
    bankConnectionCount = 0,
    teamMemberCount = 0,
    entities = [{ id: 'entity-1' }],
  } = overrides;

  // Build a chainable mock
  const createChain = (resolveValue: any) => {
    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.gte = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({ data: resolveValue, error: null });
    // For count queries
    chain.then = undefined; // Not a promise by default
    return chain;
  };

  const mock: any = {
    from: vi.fn((table: string) => {
      if (table === 'subscriptions') {
        const chain = createChain(subscription);
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.single = vi.fn().mockResolvedValue({ data: subscription, error: null });
        return chain;
      }
      if (table === 'entities') {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        // For count queries (head: true)
        Object.defineProperty(chain, 'count', { get: () => entityCount, configurable: true });
        // For data queries (getting entity IDs)
        chain.data = entities;
        // Make it resolve like a promise for await
        chain.then = (resolve: any) => resolve({ data: entities, count: entityCount, error: null });
        return chain;
      }
      if (table === 'transactions') {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.gte = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.then = (resolve: any) => resolve({ count: transactionCount, error: null });
        return chain;
      }
      if (table === 'bank_connections') {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.then = (resolve: any) => resolve({ count: bankConnectionCount, error: null });
        return chain;
      }
      if (table === 'team_members') {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.then = (resolve: any) => resolve({ count: teamMemberCount, error: null });
        return chain;
      }
      return createChain(null);
    }),
  };

  return mock;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// PLANS constants
// ============================================
describe('PLANS', () => {
  it('has all 3 tiers defined', () => {
    const tiers: PlanTier[] = ['starter', 'growth', 'pro'];
    tiers.forEach(tier => {
      expect(PLANS[tier]).toBeDefined();
    });
  });

  it('starter tier has the most restrictive limits', () => {
    const starter = PLANS.starter.limits;
    expect(starter.entities).toBe(1);
    expect(starter.transactionsPerMonth).toBe(500);
    expect(starter.bankConnections).toBe(2);
    expect(starter.teamMembers).toBe(3);
    expect(starter.features.ledgerSync).toBe(true);
    expect(starter.features.channels).toBe(true);
    expect(starter.features.receiptChase).toBe(true);
    expect(starter.features.aiAnalyst).toBe(false);
    expect(starter.features.healthMonitoring).toBe(false);
    expect(starter.features.monthEndClose).toBe(false);
    expect(starter.features.narrativeEngine).toBe(false);
  });

  it('pro tier has unlimited resources', () => {
    const pro = PLANS.pro.limits;
    expect(pro.entities).toBe(-1); // unlimited
    expect(pro.transactionsPerMonth).toBe(10000);
    expect(pro.bankConnections).toBe(-1);
    expect(pro.teamMembers).toBe(-1);
    expect(pro.features.ledgerSync).toBe(true);
    expect(pro.features.channels).toBe(true);
    expect(pro.features.receiptChase).toBe(true);
    expect(pro.features.aiAnalyst).toBe(true);
    expect(pro.features.narrativeEngine).toBe(true);
  });

  it('tiers have monotonically increasing limits', () => {
    const orderedTiers: PlanTier[] = ['starter', 'growth', 'pro'];
    for (let i = 1; i < orderedTiers.length; i++) {
      const prev = PLANS[orderedTiers[i - 1]].limits;
      const curr = PLANS[orderedTiers[i]].limits;
      // For -1 (unlimited), treat as Infinity for comparison
      const resolve = (v: number) => (v === -1 ? Infinity : v);
      expect(resolve(curr.entities)).toBeGreaterThanOrEqual(resolve(prev.entities));
      expect(resolve(curr.transactionsPerMonth)).toBeGreaterThanOrEqual(resolve(prev.transactionsPerMonth));
      expect(resolve(curr.bankConnections)).toBeGreaterThanOrEqual(resolve(prev.bankConnections));
      expect(resolve(curr.teamMembers)).toBeGreaterThanOrEqual(resolve(prev.teamMembers));
    }
  });

  it('growth tier enables AI features but not narrative engine', () => {
    const growth = PLANS.growth.limits;
    expect(growth.features.aiAnalyst).toBe(true);
    expect(growth.features.healthMonitoring).toBe(true);
    expect(growth.features.monthEndClose).toBe(true);
    expect(growth.features.taxReadiness).toBe(true);
    expect(growth.features.narrativeEngine).toBe(false);
  });

  it('all tiers have ledger sync and channels enabled', () => {
    Object.values(PLANS).forEach(plan => {
      expect(plan.limits.features.ledgerSync).toBe(true);
      expect(plan.limits.features.channels).toBe(true);
    });
  });

  it('plans have correct prices', () => {
    expect(PLANS.starter.price).toBe(29);
    expect(PLANS.growth.price).toBe(99);
    expect(PLANS.pro.price).toBe(299);
  });
});

// ============================================
// Feature flag operations (no DB count needed)
// ============================================
describe('checkPlanLimits — feature flags', () => {
  it('allows ledger sync on starter plan', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'starter', status: 'active' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.allowed).toBe(true);
  });

  it('allows ledger sync on growth plan', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'growth', status: 'active' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.allowed).toBe(true);
  });

  it('allows channel dispatch on starter plan', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'starter', status: 'active' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'dispatch_channel');
    expect(result.allowed).toBe(true);
  });

  it('allows channel dispatch on pro plan', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'pro', status: 'active' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'dispatch_channel');
    expect(result.allowed).toBe(true);
  });
});

// ============================================
// Subscription status
// ============================================
describe('checkPlanLimits — subscription status', () => {
  it('defaults to starter plan when no subscription', async () => {
    const supabase = createMockSupabase({ subscription: null });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.currentPlan).toBe('starter');
    expect(result.allowed).toBe(true); // starter has ledger sync
  });

  it('blocks operations for cancelled subscriptions', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'starter', status: 'cancelled' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('cancelled');
  });

  it('blocks operations for past_due subscriptions', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'growth', status: 'past_due' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'create_entity');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('past_due');
  });

  it('allows operations for trialing subscriptions', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'growth', status: 'trialing' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.allowed).toBe(true);
  });

  it('allows operations for active subscriptions', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'starter', status: 'active' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.allowed).toBe(true);
  });
});
