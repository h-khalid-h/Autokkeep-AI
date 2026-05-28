// ============================================
// WEEKLY DIGEST COMPILER
// Summarizes outstanding items for CPA review
// ============================================

import { createAdminClient } from '@/lib/supabase/admin';

// --- Types ---

export interface DigestItem {
  id: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  status: string;
  confidence: number | null;
  aging_days: number;
}

export interface EntityDigest {
  entityId: string;
  entityName: string;
  itemCount: number;
  totalValue: number;
  escrowCount: number;
  humanReviewCount: number;
  topItems: DigestItem[];
}

export interface WeeklyDigest {
  generatedAt: string;
  totalEntities: number;
  totalItems: number;
  totalValue: number;
  entities: EntityDigest[];
}

// --- Core ---

const REVIEW_STATUSES = ['escrow_suspense', 'human_review'] as const;
const TOP_ITEMS_LIMIT = 5;

/**
 * Compiles a weekly digest of all transactions in escrow_suspense
 * and human_review status across all entities.
 */
export async function compileWeeklyDigest(): Promise<WeeklyDigest> {
  const supabase = createAdminClient();

  // 1. Fetch all entities
  const { data: entities, error: entityError } = await (supabase as any)
    .from('entities')
    .select('id, name');

  if (entityError) {
    throw new Error(`Failed to fetch entities: ${entityError.message}`);
  }

  const entityDigests: EntityDigest[] = [];

  // 2. For each entity, query outstanding transactions
  for (const entity of entities || []) {
    const { data: transactions, error: txError } = await (supabase as any)
      .from('transactions')
      .select('id, merchant_name, amount, date, status, confidence, aging_days')
      .eq('entity_id', entity.id)
      .in('status', [...REVIEW_STATUSES])
      .order('amount', { ascending: false });

    if (txError) {
      console.error(`[Digest] Failed to query transactions for entity ${entity.id}:`, txError);
      continue;
    }

    const items: DigestItem[] = transactions || [];

    if (items.length === 0) continue;

    const escrowCount = items.filter((t) => t.status === 'escrow_suspense').length;
    const humanReviewCount = items.filter((t) => t.status === 'human_review').length;
    const totalValue = items.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    entityDigests.push({
      entityId: entity.id,
      entityName: entity.name,
      itemCount: items.length,
      totalValue: Math.round(totalValue * 100) / 100,
      escrowCount,
      humanReviewCount,
      topItems: items.slice(0, TOP_ITEMS_LIMIT),
    });
  }

  const totalItems = entityDigests.reduce((sum, e) => sum + e.itemCount, 0);
  const totalValue = entityDigests.reduce((sum, e) => sum + e.totalValue, 0);

  return {
    generatedAt: new Date().toISOString(),
    totalEntities: entityDigests.length,
    totalItems,
    totalValue: Math.round(totalValue * 100) / 100,
    entities: entityDigests,
  };
}
