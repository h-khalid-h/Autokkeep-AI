// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Auto-Categorize Service — extracted from cron route for direct invocation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// This module can be called from:
//   1. POST /api/cron/auto-categorize (scheduled cron)
//   2. POST /api/webhooks/plaid (fire-and-forget after transaction sync)
//
// Extracting the logic avoids the fragile HTTP self-call pattern (G18)
// that fails in private network deployments or when NEXT_PUBLIC_APP_URL
// doesn't resolve internally.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createAdminClient } from '@/lib/supabase/admin';
import { batchCategorize } from '@/lib/ai/categorizer';
import type {
  TransactionInput,
  CategorizationRule,
  ChartOfAccountsEntry,
  HistoricalPattern,
} from '@/lib/ai/categorizer';
import { writeAuditLog } from '@/lib/audit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { computeCompositeScore, calculateRuleScore, AUTO_COMMIT_THRESHOLD } from '@/lib/ai/confidence';

const BATCH_LIMIT = 50;

export interface AutoCategorizeResult {
  processed: number;
  auto_categorized: number;
  human_review: number;
  failed: number;
  entity_ids: string[];
}

/**
 * Run auto-categorization on pending transactions.
 *
 * This is the extracted core of the auto-categorize cron job.
 * It can be called directly (no HTTP overhead) from any context
 * that has admin-level database access.
 *
 * @param options.supabase - Optional pre-existing admin client. If not provided, one is created.
 */
export async function runAutoCategorize(options?: {
  supabase?: ReturnType<typeof createAdminClient>;
}): Promise<AutoCategorizeResult> {
  const supabase = options?.supabase ?? createAdminClient();
  const db = supabase as unknown as SupabaseQueryClient;

  // ── Fetch uncategorized transactions ────────────────────────────────
  const { data: transactions, error: txError } = await db
    .from('transactions')
    .select('id, entity_id, merchant_name, merchant_raw, amount, date, mcc_code, currency, card_holder, raw_bank_description')
    .eq('status', 'pending')
    .is('category_ai', null)
    .limit(BATCH_LIMIT);

  if (txError) {
    console.error('[Auto-Categorize] Failed to fetch transactions:', txError);
    throw new Error(`Failed to fetch uncategorized transactions: ${txError.message}`);
  }

  if (!transactions || transactions.length === 0) {
    return {
      processed: 0,
      auto_categorized: 0,
      human_review: 0,
      failed: 0,
      entity_ids: [],
    };
  }

  // ── Group transactions by entity_id ────────────────────────────────
  const txByEntity = new Map<string, Array<Record<string, unknown>>>();
  for (const tx of transactions) {
    const entityId = tx.entity_id as string;
    if (!txByEntity.has(entityId)) {
      txByEntity.set(entityId, []);
    }
    txByEntity.get(entityId)!.push(tx);
  }

  let totalProcessed = 0;
  let totalAutoCategorized = 0;
  let totalHumanReview = 0;
  let totalFailed = 0;

  // ── Process each entity batch ──────────────────────────────────────
  for (const [entityId, entityTxs] of txByEntity) {
    try {
      // Fetch categorization rules for this entity
      const { data: rulesData } = await db
        .from('categorization_rules')
        .select('*')
        .eq('entity_id', entityId);

      // Fetch chart of accounts for this entity
      const { data: chartData } = await db
        .from('chart_of_accounts')
        .select('code, name')
        .eq('entity_id', entityId);

      const chartOfAccounts: ChartOfAccountsEntry[] = (chartData || []).map(
        (c: { code: string; name: string }) => ({
          code: c.code,
          name: c.name,
        })
      );

      // Map DB rules to categorizer CategorizationRule format
      const rules: CategorizationRule[] = (rulesData || []).map((r: Record<string, unknown>) => {
        const coaEntry = chartOfAccounts.find((c) => c.code === r.gl_code);
        return {
          id: r.id as string,
          vendor_pattern: r.match_value as string,
          mcc_code: (r.mcc_code as string) || undefined,
          gl_code: r.gl_code as string,
          gl_name: coaEntry?.name || '',
          match_type: (r.rule_type as string) || 'contains',
          priority: (r.priority as number) || 0,
        };
      });

      // Fetch historical patterns
      const { data: historyData } = await db
        .from('categorization_history')
        .select('merchant, gl_code, gl_name, frequency, last_used')
        .eq('entity_id', entityId)
        .order('frequency', { ascending: false })
        .limit(100);

      const history: HistoricalPattern[] = (historyData || []).map(
        (h: Record<string, unknown>) => ({
          merchant: h.merchant as string,
          glCode: h.gl_code as string,
          glName: h.gl_name as string,
          frequency: h.frequency as number,
          lastUsed: h.last_used as string,
        })
      );

      // Build TransactionInput array
      const transactionInputs: TransactionInput[] = entityTxs.map(
        (t: Record<string, unknown>) => ({
          id: t.id as string,
          merchant: (t.merchant_name as string) || '',
          merchantRaw: (t.merchant_raw as string) || undefined,
          amount: t.amount as number,
          date: t.date as string,
          mcc: (t.mcc_code as string) || undefined,
          currency: (t.currency as string) || 'USD',
          cardHolder: (t.card_holder as string) || undefined,
          bankDescription: (t.raw_bank_description as string) || (t.merchant_raw as string) || undefined,
        })
      );

      // Run batch categorization
      const results = await batchCategorize(
        transactionInputs,
        rules,
        chartOfAccounts,
        history
      );

      // Update transactions with categorization results (parallelized)
      const updatePromises: Promise<unknown>[] = [];
      for (const [txId, result] of results) {
        const confidencePercent = Math.round(result.confidence);

        if (!result.glCode) {
          // No GL code = categorization failed regardless of confidence
          totalFailed++;
          updatePromises.push(
            db
              .from('transactions')
              .update({
                status: 'categorization_failed',
                ai_reasoning: result.reasoning,
                updated_at: new Date().toISOString(),
              })
              .eq('id', txId)
              .eq('entity_id', entityId)
              .eq('status', 'pending')
          );
        } else {
          // Use composite confidence gate (PRD §4.2) instead of raw AI confidence.
          // C_s = (w1 × P_llm) + (w2 × S_rule) + (w3 × M_doc)
          const sRule = calculateRuleScore(result.ruleMatchType);
          const composite = computeCompositeScore(
            result.confidence / 100, // normalize to 0-1
            sRule,
            0 // M_doc: no document corroboration available at batch categorization time
          );

          const newStatus =
            composite.compositeScore >= AUTO_COMMIT_THRESHOLD
              ? 'auto_categorized'
              : 'human_review';

          if (newStatus === 'auto_categorized') {
            totalAutoCategorized++;
          } else {
            totalHumanReview++;
          }

          updatePromises.push(
            db
              .from('transactions')
              .update({
                category_ai: result.glCode,
                confidence: confidencePercent, // Keep raw AI confidence for observability
                status: newStatus,
                ai_reasoning: result.reasoning,
                gl_name: result.glName || null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', txId)
              .eq('entity_id', entityId)
              .eq('status', 'pending')
          );
        }

        totalProcessed++;
      }
      await Promise.all(updatePromises);
    } catch (entityErr) {
      console.error(
        `[Auto-Categorize] Failed to process entity ${entityId}:`,
        entityErr
      );
      totalFailed += entityTxs.length;
    }
  }

  const entityIds = [...txByEntity.keys()];

  // ── Audit log the run ───────────────────────────────────────────────
  await writeAuditLog({
    supabase: db,
    entityId: undefined,
    actorId: 'system',
    actorType: 'system',
    action: 'categorize',
    targetType: 'auto_categorize',
    details: {
      processed: totalProcessed,
      auto_categorized: totalAutoCategorized,
      human_review: totalHumanReview,
      failed: totalFailed,
      entity_ids: entityIds,
    },
  });

  console.info(
    `[Auto-Categorize] Completed: ${totalProcessed} processed, ${totalAutoCategorized} auto-categorized, ${totalHumanReview} human review, ${totalFailed} failed`
  );

  return {
    processed: totalProcessed,
    auto_categorized: totalAutoCategorized,
    human_review: totalHumanReview,
    failed: totalFailed,
    entity_ids: entityIds,
  };
}
