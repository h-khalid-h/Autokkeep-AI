
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/transactions/process — Full Pipeline Orchestrator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ingestTransactions } from '@/lib/plaid/ingest';
import { batchCategorize } from '@/lib/ai/categorizer';
import { checkPlanLimits } from '@/lib/billing/plans';
import { writeAuditLog } from '@/lib/audit';
import { triageTransaction, type RuleMatchType } from '@/lib/ai/confidence';
import { rateLimit } from '@/lib/rate-limit';
import type {
  TransactionInput,
  CategorizationRule,
  ChartOfAccountsEntry,
  HistoricalPattern,
} from '@/lib/ai/categorizer';

interface ProcessRequestBody {
  entityId: string;
}

interface PipelineSummary {
  sync: {
    connections_synced: number;
    transactions_added: number;
    transactions_modified: number;
    transactions_removed: number;
    errors: string[];
  };
  categorization: {
    processed: number;
    auto_approved: number;
    flagged_for_review: number;
    failed: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'process' });
    if (limited) return limited;

    const supabase = await createServerClient();

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ProcessRequestBody = await request.json();
    const { entityId } = body;

    if (!entityId || typeof entityId !== 'string') {
      return NextResponse.json(
        { error: 'entityId is required' },
        { status: 400 }
      );
    }

    // Validate entity access
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Enforce plan limits
    const planCheck = await checkPlanLimits(supabase as any, membership.org_id, 'process_transaction');
    if (!planCheck.allowed) {
      return NextResponse.json({ error: planCheck.reason, plan: planCheck.currentPlan }, { status: 403 });
    }

    const { data: entity } = await (supabase as any)
      .from('entities')
      .select('id, org_id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    const summary: PipelineSummary = {
      sync: {
        connections_synced: 0,
        transactions_added: 0,
        transactions_modified: 0,
        transactions_removed: 0,
        errors: [],
      },
      categorization: {
        processed: 0,
        auto_approved: 0,
        flagged_for_review: 0,
        failed: 0,
      },
    };

    // ── Step 1: Sync from all connected banks ──────────────────────────────

    const { data: connections } = await (supabase as any)
      .from('bank_connections')
      .select('*')
      .eq('entity_id', entityId)
      .eq('status', 'active');

    if (connections && connections.length > 0) {
      for (const connection of connections) {
        try {
          const ingestResult = await ingestTransactions(supabase as any, connection);
          summary.sync.transactions_added += ingestResult.added;
          summary.sync.transactions_modified += ingestResult.modified;
          summary.sync.transactions_removed += ingestResult.removed;
          summary.sync.connections_synced++;
        } catch (syncError) {
          const errorMsg = `Failed to sync connection ${connection.id}: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`;
          summary.sync.errors.push(errorMsg);
          console.error('[Process Pipeline]', errorMsg);
        }
      }
    }

    // ── Step 2: Run AI categorization on uncategorized transactions ─────────

    const { data: pendingTransactions } = await (supabase as any)
      .from('transactions')
      .select('*')
      .eq('entity_id', entityId)
      .in('status', ['pending', 'human_review'])
      .is('category_ai', null);

    if (pendingTransactions && pendingTransactions.length > 0) {
      // Fetch chart of accounts
      const { data: chartData } = await (supabase as any)
        .from('chart_of_accounts')
        .select('code, name')
        .eq('entity_id', entityId);

      const chartOfAccounts: ChartOfAccountsEntry[] = (chartData || []).map(
        (c: { code: string; name: string }) => ({
          code: c.code,
          name: c.name,
        })
      );

      // Fetch categorization rules
      const { data: rulesData } = await (supabase as any)
        .from('categorization_rules')
        .select('*')
        .eq('entity_id', entityId);

      const rules: CategorizationRule[] = (rulesData || []).map((r: Record<string, any>) => {
        // Look up gl_name from chart of accounts for this rule's GL code
        const coaEntry = chartOfAccounts.find(c => c.code === r.gl_code);
        return {
          id: r.id,
          vendor_pattern: r.match_value,
          mcc_code: r.mcc_code || undefined,
          gl_code: r.gl_code,
          gl_name: coaEntry?.name || '',
          match_type: r.rule_type || 'contains',
          priority: r.priority || 0,
        };
      });

      // Fetch historical patterns
      const { data: historyData } = await (supabase as any)
        .from('categorization_history')
        .select('merchant, gl_code, gl_name, frequency, last_used')
        .eq('entity_id', entityId)
        .order('frequency', { ascending: false })
        .limit(100);

      const history: HistoricalPattern[] = (historyData || []).map((h: Record<string, any>) => ({
        merchant: h.merchant,
        glCode: h.gl_code,
        glName: h.gl_name,
        frequency: h.frequency,
        lastUsed: h.last_used,
      }));

      // Build transaction inputs
      const transactionInputs: TransactionInput[] = pendingTransactions.map(
        (t: Record<string, any>) => ({
          id: t.id,
          merchant: t.merchant_name,
          merchantRaw: t.merchant_raw,
          amount: t.amount,
          date: t.date,
          mcc: t.mcc || undefined,
          currency: t.currency || 'USD',
          cardHolder: t.card_holder || undefined,
          bankDescription: t.merchant_raw,
        })
      );

      // Run batch categorization
      const results = await batchCategorize(
        transactionInputs,
        rules,
        chartOfAccounts,
        history
      );

      // ── Step 3 & 4: Auto-approve ≥95%, flag <95% for HITL ──────────────

      // Pre-fetch document anchors for ALL transactions in batch (avoid N+1)
      const batchTxIds = Array.from(results.keys());
      const { data: batchDocAnchors } = await (supabase as any)
        .from('document_anchors')
        .select('transaction_id')
        .in('transaction_id', batchTxIds);
      const docAnchorSet = new Set(
        (batchDocAnchors || []).map((d: { transaction_id: string }) => d.transaction_id)
      );

      // Cache triage results for reuse in history learning (step 5)
      const triageCache = new Map<string, ReturnType<typeof triageTransaction>>();

      for (const [txId, result] of results) {
        // ── Composite Confidence Gate (PRD §5.1) ──
        const hasDocument = docAnchorSet.has(txId);

        const originalTx = pendingTransactions.find((t: Record<string, any>) => t.id === txId);
        const txAmount = originalTx?.amount || 0;

        const triage = triageTransaction(
          result.confidence / 100,
          result.ruleMatchType as RuleMatchType,
          hasDocument,
          txAmount,
        );
        triageCache.set(txId, triage);

        const targetStatus = result.confidence === 0 && !result.glCode
          ? 'categorization_failed'
          : triage.targetStatus;

        if (result.confidence === 0 && !result.glCode) {
          summary.categorization.failed++;
        } else if (triage.decision === 'auto_commit') {
          summary.categorization.auto_approved++;
        } else {
          summary.categorization.flagged_for_review++;
        }

        await (supabase as any)
          .from('transactions')
          .update({
            category_ai: result.glCode || null,
            confidence: Math.round(triage.confidence.compositeScore * 100),
            ai_reasoning: `${result.reasoning} [C_s=${triage.confidence.compositeScore.toFixed(4)}, decision=${triage.decision}]`,
            status: targetStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', txId)
          .eq('entity_id', entityId);
      }

      summary.categorization.processed = results.size;

      // ── Step 5: History Learning Loop ─────────────────────────────────
      // Write successful categorizations back to categorization_history
      // so the deterministic engine gets smarter over time.

      const historyInserts: Array<{
        entity_id: string;
        merchant: string;
        gl_code: string;
        gl_name: string;
      }> = [];

      for (const [txId, result] of results) {
        // Reuse cached triage result from step 3/4
        const triage = triageCache.get(txId);
        if (triage?.decision === 'auto_commit' && result.glCode) {
          const txn = pendingTransactions.find(
            (t: Record<string, any>) => t.id === txId
          );
          const merchantName = txn?.merchant_name || txn?.merchant_raw;
          if (merchantName) {
            historyInserts.push({
              entity_id: entityId,
              merchant: merchantName.toLowerCase().trim(),
              gl_code: result.glCode,
              gl_name: result.glName || '',
            });
          }
        }
      }

      if (historyInserts.length > 0) {
        // Deduplicate: group by merchant+gl_code and count occurrences
        const historyMap = new Map<string, { entity_id: string; merchant: string; gl_code: string; gl_name: string; count: number }>();
        for (const h of historyInserts) {
          const key = `${h.entity_id}:${h.merchant}:${h.gl_code}`;
          const existing = historyMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            historyMap.set(key, { ...h, count: 1 });
          }
        }

        // Batch upsert: fetch existing frequencies first, then increment
        const dedupedEntries = Array.from(historyMap.values());
        const now = new Date().toISOString();

        // Fetch existing frequencies for all merchants being upserted
        const { data: existingHistory } = await (supabase as any)
          .from('categorization_history')
          .select('merchant, gl_code, frequency')
          .eq('entity_id', entityId)
          .in('merchant', dedupedEntries.map(h => h.merchant))
          .in('gl_code', dedupedEntries.map(h => h.gl_code));

        const existingFreqMap = new Map<string, number>();
        for (const row of existingHistory || []) {
          existingFreqMap.set(`${row.merchant}:${row.gl_code}`, row.frequency || 0);
        }

        await (supabase as any)
          .from('categorization_history')
          .upsert(
            dedupedEntries.map(h => ({
              entity_id: h.entity_id,
              merchant: h.merchant,
              gl_code: h.gl_code,
              gl_name: h.gl_name,
              frequency: (existingFreqMap.get(`${h.merchant}:${h.gl_code}`) || 0) + h.count,
              last_used: now,
            })),
            { onConflict: 'entity_id,merchant,gl_code' }
          );
      }

    }

    // Log to audit
    await writeAuditLog({
      supabase,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'sync',
      targetType: 'entity',
      targetId: entityId,
      details: summary,
      request,
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[Process Pipeline] Error:', error);
    return NextResponse.json(
      { error: 'Pipeline processing failed' },
      { status: 500 }
    );
  }
}
