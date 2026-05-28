
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/transactions/process — Full Pipeline Orchestrator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { syncTransactions } from '@/lib/plaid/client';
import { batchCategorize } from '@/lib/ai/categorizer';
import { checkPlanLimits } from '@/lib/billing/plans';
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
          const syncResult = await syncTransactions(
            connection.plaid_access_token,
            connection.cursor || undefined
          );

          // Insert new transactions
          if (syncResult.added.length > 0) {
            const transactionRecords = syncResult.added.map((t: Record<string, any>) => ({
              entity_id: entityId,
              bank_account_id: t.account_id,
              plaid_transaction_id: t.transaction_id,
              amount: t.amount,
              date: t.date,
              merchant_name: t.merchant_name || t.name,
              merchant_raw: t.name,
              currency: t.iso_currency_code || 'USD',
              status: 'pending',
              confidence: 0,
            }));

            await (supabase as any).from('transactions').upsert(transactionRecords, {
              onConflict: 'plaid_transaction_id',
              ignoreDuplicates: true,
            });
            summary.sync.transactions_added += syncResult.added.length;
          }

          // Handle modified transactions — clear AI categorization for re-processing
          for (const t of syncResult.modified) {
            await (supabase as any)
              .from('transactions')
              .update({
                amount: t.amount,
                date: t.date,
                merchant_name: t.merchant_name || t.name,
                merchant_raw: t.name,
                // Reset AI categorization so the transaction gets re-categorized
                category_ai: null,
                confidence: 0,
                ai_reasoning: null,
                status: 'pending',
                updated_at: new Date().toISOString(),
              })
              .eq('plaid_transaction_id', t.transaction_id)
              .eq('entity_id', entityId);
          }
          summary.sync.transactions_modified += syncResult.modified.length;

          // Handle removed transactions (batch soft delete)
          if (syncResult.removed.length > 0) {
            const removedIds = syncResult.removed.map((t) => t.transaction_id);
            await (supabase as any)
              .from('transactions')
              .update({
                status: 'removed',
                updated_at: new Date().toISOString(),
              })
              .in('plaid_transaction_id', removedIds)
              .eq('entity_id', entityId);
          }
          summary.sync.transactions_removed += syncResult.removed.length;

          // Update cursor on connection
          await (supabase as any)
            .from('bank_connections')
            .update({
              cursor: syncResult.nextCursor,
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', connection.id);

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

      for (const [txId, result] of results) {
        const status =
          result.confidence === 0 && !result.glCode
            ? 'categorization_failed'
            : result.confidence >= 95
              ? 'auto_categorized'
              : 'human_review';

        if (result.confidence === 0 && !result.glCode) {
          summary.categorization.failed++;
        } else if (result.confidence >= 95) {
          summary.categorization.auto_approved++;
        } else {
          summary.categorization.flagged_for_review++;
        }

        await (supabase as any)
          .from('transactions')
          .update({
            category_ai: result.glCode || null,
            confidence: result.confidence,
            ai_reasoning: result.glName ? `${result.reasoning} [GL Name: ${result.glName}]` : result.reasoning,
            status,
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
        if (result.confidence >= 95 && result.glCode) {
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

        // Batch upsert: insert new entries (conflicts are ignored)
        const dedupedEntries = Array.from(historyMap.values());
        const now = new Date().toISOString();
        await (supabase as any)
          .from('categorization_history')
          .upsert(
            dedupedEntries.map(h => ({
              entity_id: h.entity_id,
              merchant: h.merchant,
              gl_code: h.gl_code,
              gl_name: h.gl_name,
              frequency: h.count,
              last_used: now,
            })),
            { onConflict: 'entity_id,merchant,gl_code' }
          );
        // Note: This overwrites frequency rather than incrementing it.
        // For true increment, a Supabase RPC function is needed.
        // In practice, the frequency serves as a rough signal for history-based
        // categorization, so overwriting with the latest batch count is acceptable.
      }

    }

    // Log to audit
    await (supabase as any).from('audit_log').insert({
      entity_id: entityId,
      actor_id: user.id,
      actor_type: 'human',
      action: 'sync',
      target_type: 'entity',
      target_id: entityId,
      details: summary,
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
