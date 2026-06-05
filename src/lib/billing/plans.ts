// ============================================
// PLAN ENFORCEMENT
// Checks subscription limits before operations
// ============================================

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

export type PlanTier = 'starter' | 'growth' | 'pro';

export interface PlanFeatures {
  aiAnalyst: boolean;
  healthMonitoring: boolean;
  monthEndClose: boolean;
  taxReadiness: boolean;
  narrativeEngine: boolean;
  ledgerSync: boolean;
  channels: boolean;
  receiptChase: boolean;
}

export interface PlanLimits {
  entities: number;           // -1 = unlimited
  transactionsPerMonth: number;
  bankConnections: number;    // -1 = unlimited
  teamMembers: number;        // -1 = unlimited
  features: PlanFeatures;
}

export interface PlanDefinition {
  name: string;
  price: number;
  limits: PlanLimits;
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  starter: {
    name: 'Starter',
    price: 29,
    limits: {
      entities: 1,
      transactionsPerMonth: 500,
      bankConnections: 2,
      teamMembers: 3,
      features: {
        aiAnalyst: false,
        healthMonitoring: false,
        monthEndClose: false,
        taxReadiness: false,
        narrativeEngine: false,
        ledgerSync: true,
        channels: true,
        receiptChase: true,
      },
    },
  },
  growth: {
    name: 'Growth',
    price: 99,
    limits: {
      entities: 3,
      transactionsPerMonth: 2500,
      bankConnections: 10,
      teamMembers: 10,
      features: {
        aiAnalyst: true,
        healthMonitoring: true,
        monthEndClose: true,
        taxReadiness: true,
        narrativeEngine: false,
        ledgerSync: true,
        channels: true,
        receiptChase: true,
      },
    },
  },
  pro: {
    name: 'Pro',
    price: 299,
    limits: {
      entities: -1, // unlimited
      transactionsPerMonth: 10000,
      bankConnections: -1,
      teamMembers: -1,
      features: {
        aiAnalyst: true,
        healthMonitoring: true,
        monthEndClose: true,
        taxReadiness: true,
        narrativeEngine: true,
        ledgerSync: true,
        channels: true,
        receiptChase: true,
      },
    },
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
 * @param supabase - Supabase client
 * @param orgId - Organization ID
 * @param operation - What operation to check
 */
export async function checkPlanLimits(
  supabase: Pick<SupabaseQueryClient, 'from'>,
  orgId: string,
  operation: 'create_entity' | 'process_transaction' | 'connect_bank' | 'sync_ledger' | 'dispatch_channel' | 'add_team_member' | 'ai_analyst' | 'health_monitoring' | 'month_end_close' | 'tax_readiness'
): Promise<PlanCheckResult> {
  // Get subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, created_at')
    .eq('org_id', orgId)
    .single();

  const plan: PlanTier = sub?.plan || 'starter';
  const planDef = PLANS[plan];
  const limits = planDef.limits;

  // Check subscription is active
  if (sub && sub.status !== 'active' && sub.status !== 'trialing') {
    // Allow a 7-day grace period for past_due before blocking
    if (sub.status === 'past_due') {
      const pastDueAt = new Date(sub.current_period_end || sub.created_at);
      const gracePeriodEnd = new Date(pastDueAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (new Date() > gracePeriodEnd) {
        return {
          allowed: false,
          reason: 'Your payment is overdue. Please update your billing to continue.',
          currentPlan: plan,
        };
      }
      // Within grace period — allow but log warning
      console.warn(`[billing] Org ${orgId} in past_due grace period`);
    } else {
      return {
        allowed: false,
        reason: `Subscription is ${sub.status}. Please update your billing to continue.`,
        currentPlan: plan,
      };
    }
  }

  switch (operation) {
    case 'create_entity': {
      if (limits.entities === -1) break; // unlimited

      const { count } = await supabase
        .from('entities')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId);

      if ((count || 0) >= limits.entities) {
        return {
          allowed: false,
          reason: `Your ${planDef.name} plan allows ${limits.entities} entity(s). Upgrade to add more.`,
          currentPlan: plan,
          limit: limits.entities,
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
        const { getRedisClient } = await import('@/lib/redis');
        const redis = getRedisClient();
        if (!redis) throw new Error('Redis not configured');

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
        if (newCount > limits.transactionsPerMonth) {
          // Decrement back since we're rejecting this request
          await redis.decr(redisKey);
          return {
            allowed: false,
            reason: `Monthly transaction limit reached (${limits.transactionsPerMonth}). Upgrade your plan.`,
            currentPlan: plan,
            limit: limits.transactionsPerMonth,
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

        if ((count || 0) >= limits.transactionsPerMonth) {
          return {
            allowed: false,
            reason: `Monthly transaction limit reached (${limits.transactionsPerMonth}). Upgrade your plan.`,
            currentPlan: plan,
            limit: limits.transactionsPerMonth,
            current: count || 0,
          };
        }
      }
      break;
    }

    case 'connect_bank': {
      if (limits.bankConnections === -1) break; // unlimited

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

      if ((count || 0) >= limits.bankConnections) {
        return {
          allowed: false,
          reason: `Your ${planDef.name} plan allows ${limits.bankConnections} bank connection(s).`,
          currentPlan: plan,
          limit: limits.bankConnections,
          current: count || 0,
        };
      }
      break;
    }

    case 'sync_ledger': {
      if (!limits.features.ledgerSync) {
        return {
          allowed: false,
          reason: 'Ledger sync is not available on your current plan. Upgrade to enable QuickBooks/Xero sync.',
          currentPlan: plan,
        };
      }
      break;
    }

    case 'dispatch_channel': {
      if (!limits.features.channels) {
        return {
          allowed: false,
          reason: 'Channel dispatch (Slack, SMS, etc.) is not available on your current plan.',
          currentPlan: plan,
        };
      }
      break;
    }

    case 'ai_analyst': {
      if (!limits.features.aiAnalyst) {
        return {
          allowed: false,
          reason: 'AI Analyst is not available on your current plan. Upgrade to Growth or Pro to unlock AI features.',
          currentPlan: plan,
        };
      }
      break;
    }

    case 'health_monitoring': {
      if (!limits.features.healthMonitoring) {
        return {
          allowed: false,
          reason: 'Health Monitoring is not available on your current plan. Upgrade to Growth or Pro to unlock this feature.',
          currentPlan: plan,
        };
      }
      break;
    }

    case 'month_end_close': {
      if (!limits.features.monthEndClose) {
        return {
          allowed: false,
          reason: 'Month-End Close is not available on your current plan. Upgrade to Growth or Pro to unlock this feature.',
          currentPlan: plan,
        };
      }
      break;
    }

    case 'tax_readiness': {
      if (!limits.features.taxReadiness) {
        return {
          allowed: false,
          reason: 'Tax Readiness Analysis is not available on your current plan. Upgrade to Growth or Pro to unlock this feature.',
          currentPlan: plan,
        };
      }
      break;
    }

    case 'add_team_member': {
      if (limits.teamMembers === -1) break; // unlimited

      const { count } = await supabase
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId);

      if ((count || 0) >= limits.teamMembers) {
        return {
          allowed: false,
          reason: `Your ${planDef.name} plan allows ${limits.teamMembers} team member(s).`,
          currentPlan: plan,
          limit: limits.teamMembers,
          current: count || 0,
        };
      }
      break;
    }
  }

  return { allowed: true, currentPlan: plan };
}
