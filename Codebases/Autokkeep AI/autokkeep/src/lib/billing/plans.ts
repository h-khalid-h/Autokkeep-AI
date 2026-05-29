// ============================================
// PLAN ENFORCEMENT
// Checks subscription limits before operations
// ============================================

export type PlanTier = 'free' | 'starter' | 'smb_growth' | 'cpa_professional' | 'cpa_enterprise';

export interface PlanLimits {
  maxEntities: number;
  maxTransactionsPerMonth: number;
  maxBankConnections: number;
  maxTeamMembers: number;
  aiCategorizationEnabled: boolean;
  ledgerSyncEnabled: boolean;
  channelDispatchEnabled: boolean;
  receiptChaseEnabled: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    maxEntities: 1,
    maxTransactionsPerMonth: 50,
    maxBankConnections: 1,
    maxTeamMembers: 1,
    aiCategorizationEnabled: true,
    ledgerSyncEnabled: false,
    channelDispatchEnabled: false,
    receiptChaseEnabled: false,
  },
  starter: {
    maxEntities: 1,
    maxTransactionsPerMonth: 200,
    maxBankConnections: 2,
    maxTeamMembers: 2,
    aiCategorizationEnabled: true,
    ledgerSyncEnabled: true,
    channelDispatchEnabled: true,
    receiptChaseEnabled: false,
  },
  smb_growth: {
    maxEntities: 3,
    maxTransactionsPerMonth: 1000,
    maxBankConnections: 10,
    maxTeamMembers: 5,
    aiCategorizationEnabled: true,
    ledgerSyncEnabled: true,
    channelDispatchEnabled: true,
    receiptChaseEnabled: true,
  },
  cpa_professional: {
    maxEntities: 15,
    maxTransactionsPerMonth: 5000,
    maxBankConnections: 50,
    maxTeamMembers: 10,
    aiCategorizationEnabled: true,
    ledgerSyncEnabled: true,
    channelDispatchEnabled: true,
    receiptChaseEnabled: true,
  },
  cpa_enterprise: {
    maxEntities: 999999,
    maxTransactionsPerMonth: 999999,
    maxBankConnections: 999999,
    maxTeamMembers: 999999,
    aiCategorizationEnabled: true,
    ledgerSyncEnabled: true,
    channelDispatchEnabled: true,
    receiptChaseEnabled: true,
  },
};

export interface PlanCheckResult {
  allowed: boolean;
  reason?: string;
  currentPlan: PlanTier;
  limit?: number;
  current?: number;
}

/**
 * Check if an org's subscription allows a specific operation.
 * Call this from API routes before performing billable operations.
 * 
 * @param supabase - Supabase client (already typed as any in routes)
 * @param orgId - Organization ID
 * @param operation - What operation to check
 */
export async function checkPlanLimits(
  supabase: any,
  orgId: string,
  operation: 'create_entity' | 'process_transaction' | 'connect_bank' | 'sync_ledger' | 'dispatch_channel' | 'add_team_member'
): Promise<PlanCheckResult> {
  // Get subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('org_id', orgId)
    .single();

  const plan: PlanTier = sub?.plan || 'free';
  const limits = PLAN_LIMITS[plan];

  // Check subscription is active
  if (sub && sub.status !== 'active' && sub.status !== 'trialing') {
    return {
      allowed: false,
      reason: `Subscription is ${sub.status}. Please update your billing to continue.`,
      currentPlan: plan,
    };
  }

  switch (operation) {
    case 'create_entity': {
      const { count } = await supabase
        .from('entities')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId);
      
      if ((count || 0) >= limits.maxEntities) {
        return {
          allowed: false,
          reason: `Your ${plan} plan allows ${limits.maxEntities} entity(s). Upgrade to add more.`,
          currentPlan: plan,
          limit: limits.maxEntities,
          current: count || 0,
        };
      }
      break;
    }

    case 'process_transaction': {
      // Use Redis atomic counter to prevent race conditions on concurrent requests.
      // The counter key resets monthly via TTL. Falls back to DB count if Redis is down.
      let currentCount: number | null = null;

      try {
        const { getRedis } = await import('@/lib/redis');
        const redis = getRedis();
        
        // Key format: billing:tx_count:{orgId}:{YYYY-MM}
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const redisKey = `billing:tx_count:${orgId}:${monthKey}`;
        
        // Atomic increment — returns the new count AFTER increment
        const newCount = await redis.incr(redisKey);
        
        // Set expiry to end of month + 1 day buffer (only if key was just created)
        if (newCount === 1) {
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          const ttlSeconds = Math.ceil((endOfMonth.getTime() - now.getTime()) / 1000) + 86400;
          await redis.expire(redisKey, ttlSeconds);
        }
        
        // Check limit AFTER incrementing (atomic check-and-increment)
        if (newCount > limits.maxTransactionsPerMonth) {
          // Decrement back since we're rejecting this request
          await redis.decr(redisKey);
          return {
            allowed: false,
            reason: `Monthly transaction limit reached (${limits.maxTransactionsPerMonth}). Upgrade your plan.`,
            currentPlan: plan,
            limit: limits.maxTransactionsPerMonth,
            current: newCount - 1,
          };
        }
        
        // Counter is within limits — allow
        currentCount = newCount;
      } catch {
        // Redis unavailable — fall back to DB count (original behavior)
        console.warn('[Billing] Redis unavailable for atomic counter, falling back to DB count');
      }

      // Fallback: DB count (subject to race condition but better than no check)
      if (currentCount === null) {
        const firstOfMonth = new Date();
        firstOfMonth.setDate(1);
        firstOfMonth.setHours(0, 0, 0, 0);

        const { data: orgEntities } = await supabase
          .from('entities')
          .select('id')
          .eq('org_id', orgId);
        
        const entityIds = (orgEntities || []).map((e: { id: string }) => e.id);
        
        if (entityIds.length === 0) break;

        const { count } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', firstOfMonth.toISOString())
          .in('entity_id', entityIds);

        if ((count || 0) >= limits.maxTransactionsPerMonth) {
          return {
            allowed: false,
            reason: `Monthly transaction limit reached (${limits.maxTransactionsPerMonth}). Upgrade your plan.`,
            currentPlan: plan,
            limit: limits.maxTransactionsPerMonth,
            current: count || 0,
          };
        }
      }
      break;
    }

    case 'connect_bank': {
      // Step 1: Get entity IDs for this org
      const { data: bankEntities } = await supabase
        .from('entities')
        .select('id')
        .eq('org_id', orgId);
      
      const bankEntityIds = (bankEntities || []).map((e: { id: string }) => e.id);
      
      if (bankEntityIds.length === 0) {
        break;
      }

      // Step 2: Count active bank connections across all org entities
      const { count } = await supabase
        .from('bank_connections')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .in('entity_id', bankEntityIds);

      if ((count || 0) >= limits.maxBankConnections) {
        return {
          allowed: false,
          reason: `Your ${plan} plan allows ${limits.maxBankConnections} bank connection(s).`,
          currentPlan: plan,
          limit: limits.maxBankConnections,
          current: count || 0,
        };
      }
      break;
    }

    case 'sync_ledger': {
      if (!limits.ledgerSyncEnabled) {
        return {
          allowed: false,
          reason: 'Ledger sync is not available on your current plan. Upgrade to enable QuickBooks/Xero sync.',
          currentPlan: plan,
        };
      }
      break;
    }

    case 'dispatch_channel': {
      if (!limits.channelDispatchEnabled) {
        return {
          allowed: false,
          reason: 'Channel dispatch (Slack, SMS, etc.) is not available on your current plan.',
          currentPlan: plan,
        };
      }
      break;
    }

    case 'add_team_member': {
      const { count } = await supabase
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId);

      if ((count || 0) >= limits.maxTeamMembers) {
        return {
          allowed: false,
          reason: `Your ${plan} plan allows ${limits.maxTeamMembers} team member(s).`,
          currentPlan: plan,
          limit: limits.maxTeamMembers,
          current: count || 0,
        };
      }
      break;
    }
  }

  return { allowed: true, currentPlan: plan };
}
