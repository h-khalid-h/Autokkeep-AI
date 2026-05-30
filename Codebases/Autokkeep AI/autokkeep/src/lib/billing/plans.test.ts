import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PLAN_LIMITS, checkPlanLimits } from './plans';
import type { PlanTier, PlanLimits } from './plans';

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
function createMockSupabase(overrides: {
  subscription?: { plan: PlanTier; status: string } | null;
  entityCount?: number;
  transactionCount?: number;
  bankConnectionCount?: number;
  teamMemberCount?: number;
  entities?: { id: string }[];
} = {}) {
  const {
    subscription = { plan: 'free' as PlanTier, status: 'active' },
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

// ============================================
// PLAN_LIMITS constants
// ============================================
describe('PLAN_LIMITS', () => {
  it('has all 5 tiers defined', () => {
    const tiers: PlanTier[] = ['free', 'starter', 'smb_growth', 'cpa_professional', 'cpa_enterprise'];
    tiers.forEach(tier => {
      expect(PLAN_LIMITS[tier]).toBeDefined();
    });
  });

  it('free tier has strictest limits', () => {
    const free = PLAN_LIMITS.free;
    expect(free.maxEntities).toBe(1);
    expect(free.maxTransactionsPerMonth).toBe(50);
    expect(free.maxBankConnections).toBe(1);
    expect(free.maxTeamMembers).toBe(1);
    expect(free.ledgerSyncEnabled).toBe(false);
    expect(free.channelDispatchEnabled).toBe(false);
    expect(free.receiptChaseEnabled).toBe(false);
  });

  it('enterprise tier has unlimited resources', () => {
    const ent = PLAN_LIMITS.cpa_enterprise;
    expect(ent.maxEntities).toBe(999999);
    expect(ent.maxTransactionsPerMonth).toBe(999999);
    expect(ent.maxBankConnections).toBe(999999);
    expect(ent.maxTeamMembers).toBe(999999);
    expect(ent.ledgerSyncEnabled).toBe(true);
    expect(ent.channelDispatchEnabled).toBe(true);
    expect(ent.receiptChaseEnabled).toBe(true);
  });

  it('tiers have monotonically increasing limits', () => {
    const orderedTiers: PlanTier[] = ['free', 'starter', 'smb_growth', 'cpa_professional', 'cpa_enterprise'];
    for (let i = 1; i < orderedTiers.length; i++) {
      const prev = PLAN_LIMITS[orderedTiers[i - 1]];
      const curr = PLAN_LIMITS[orderedTiers[i]];
      expect(curr.maxEntities).toBeGreaterThanOrEqual(prev.maxEntities);
      expect(curr.maxTransactionsPerMonth).toBeGreaterThanOrEqual(prev.maxTransactionsPerMonth);
      expect(curr.maxBankConnections).toBeGreaterThanOrEqual(prev.maxBankConnections);
      expect(curr.maxTeamMembers).toBeGreaterThanOrEqual(prev.maxTeamMembers);
    }
  });

  it('all tiers have AI categorization enabled', () => {
    Object.values(PLAN_LIMITS).forEach(limits => {
      expect(limits.aiCategorizationEnabled).toBe(true);
    });
  });

  it('starter enables ledger sync and channel dispatch', () => {
    expect(PLAN_LIMITS.starter.ledgerSyncEnabled).toBe(true);
    expect(PLAN_LIMITS.starter.channelDispatchEnabled).toBe(true);
    expect(PLAN_LIMITS.starter.receiptChaseEnabled).toBe(false);
  });

  it('smb_growth enables all features', () => {
    const growth = PLAN_LIMITS.smb_growth;
    expect(growth.ledgerSyncEnabled).toBe(true);
    expect(growth.channelDispatchEnabled).toBe(true);
    expect(growth.receiptChaseEnabled).toBe(true);
  });
});

// ============================================
// Feature flag operations (no DB count needed)
// ============================================
describe('checkPlanLimits — feature flags', () => {
  it('blocks ledger sync on free plan', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'free', status: 'active' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Ledger sync');
  });

  it('allows ledger sync on starter plan', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'starter', status: 'active' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.allowed).toBe(true);
  });

  it('blocks channel dispatch on free plan', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'free', status: 'active' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'dispatch_channel');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Channel dispatch');
  });

  it('allows channel dispatch on starter plan', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'starter', status: 'active' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'dispatch_channel');
    expect(result.allowed).toBe(true);
  });
});

// ============================================
// Subscription status
// ============================================
describe('checkPlanLimits — subscription status', () => {
  it('defaults to free plan when no subscription', async () => {
    const supabase = createMockSupabase({ subscription: null });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.currentPlan).toBe('free');
    expect(result.allowed).toBe(false); // free doesn't have ledger sync
  });

  it('blocks operations for cancelled subscriptions', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'starter', status: 'cancelled' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('cancelled');
  });

  it('blocks operations for past_due subscriptions', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'smb_growth', status: 'past_due' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'create_entity');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('past_due');
  });

  it('allows operations for trialing subscriptions', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'smb_growth', status: 'trialing' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.allowed).toBe(true);
  });

  it('allows operations for active subscriptions', async () => {
    const supabase = createMockSupabase({ subscription: { plan: 'starter', status: 'active' } });
    const result = await checkPlanLimits(supabase, 'org-1', 'sync_ledger');
    expect(result.allowed).toBe(true);
  });
});
