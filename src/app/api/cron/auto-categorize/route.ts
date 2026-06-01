
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/cron/auto-categorize — Automated AI Transaction Categorization (Cron)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { captureException } from '@/lib/sentry';
import { createAdminClient } from '@/lib/supabase/admin';
import { batchCategorize } from '@/lib/ai/categorizer';
import type {
  TransactionInput,
  CategorizationRule,
  ChartOfAccountsEntry,
  HistoricalPattern,
} from '@/lib/ai/categorizer';
import { writeAuditLog } from '@/lib/audit';

const BATCH_LIMIT = 50;
const AUTO_CATEGORIZE_THRESHOLD = 80;

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // ── Fetch uncategorized transactions ────────────────────────────────
    const { data: transactions, error: txError } = await db
      .from('transactions')
      .select('id, entity_id, merchant_name, merchant_raw, amount, date, mcc_code, currency, card_holder, raw_bank_description')
      .eq('status', 'pending')
      .is('category_ai', null)
      .limit(BATCH_LIMIT);

    if (txError) {
      console.error('[Cron Auto-Categorize] Failed to fetch transactions:', txError);
      return NextResponse.json(
        { error: 'Failed to fetch uncategorized transactions' },
        { status: 500 }
      );
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({
        processed: 0,
        auto_categorized: 0,
        human_review: 0,
        failed: 0,
        message: 'No uncategorized transactions found',
      });
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

        // Update each transaction with categorization results
        for (const [txId, result] of results) {
          const confidencePercent = Math.round(result.confidence);

          if (result.confidence === 0 && !result.glCode) {
            totalFailed++;
            await db
              .from('transactions')
              .update({
                status: 'categorization_failed',
                ai_reasoning: result.reasoning,
                updated_at: new Date().toISOString(),
              })
              .eq('id', txId)
              .eq('entity_id', entityId);
          } else {
            const newStatus =
              confidencePercent >= AUTO_CATEGORIZE_THRESHOLD
                ? 'auto_categorized'
                : 'human_review';

            if (newStatus === 'auto_categorized') {
              totalAutoCategorized++;
            } else {
              totalHumanReview++;
            }

            await db
              .from('transactions')
              .update({
                category_ai: result.glCode,
                confidence: confidencePercent,
                status: newStatus,
                ai_reasoning: result.reasoning,
                gl_name: result.glName || null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', txId)
              .eq('entity_id', entityId);
          }

          totalProcessed++;
        }
      } catch (entityErr) {
        console.error(
          `[Cron Auto-Categorize] Failed to process entity ${entityId}:`,
          entityErr
        );
        totalFailed += entityTxs.length;
      }
    }

    // ── Audit log the cron run ─────────────────────────────────────────
    await writeAuditLog({
      supabase: db,
      entityId: 'system',
      actorId: 'system',
      actorType: 'system',
      action: 'categorize',
      targetType: 'auto_categorize_cron',
      details: {
        processed: totalProcessed,
        auto_categorized: totalAutoCategorized,
        human_review: totalHumanReview,
        failed: totalFailed,
        entity_ids: [...txByEntity.keys()],
      },
      request,
    });

    console.info(
      `[Cron Auto-Categorize] Completed: ${totalProcessed} processed, ${totalAutoCategorized} auto-categorized, ${totalHumanReview} human review, ${totalFailed} failed`
    );

    return NextResponse.json({
      processed: totalProcessed,
      auto_categorized: totalAutoCategorized,
      human_review: totalHumanReview,
      failed: totalFailed,
    });
  } catch (error) {
    captureException(error, { tags: { route: 'cron/auto-categorize' } });
    console.error('[Cron Auto-Categorize] Error:', error);
    return NextResponse.json(
      { error: 'Auto-categorization cron failed' },
      { status: 500 }
    );
  }
}
