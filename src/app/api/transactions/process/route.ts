
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/transactions/process — Full Pipeline Orchestrator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { ingestTransactions, type BankConnection } from '@/lib/plaid/ingest';
import { batchCategorize } from '@/lib/ai/categorizer';
import { checkPlanLimits } from '@/lib/billing/plans';
import { writeAuditLog } from '@/lib/audit';
import { triageTransaction, type RuleMatchType } from '@/lib/ai/confidence';
import { checkApprovalRequired, requestApproval } from '@/lib/approval';
import { rateLimit } from '@/lib/rate-limit';
import { resolveOrCreateVendor } from '@/lib/vendors/service';
import { applyFxConversion } from '@/lib/fx/service';
import { parseBody, schemas } from '@/lib/validation';
import type {
  TransactionInput,
  CategorizationRule,
  ChartOfAccountsEntry,
  HistoricalPattern,
} from '@/lib/ai/categorizer';

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

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const result = await parseBody(request, schemas.processTransaction);
    if (!result.success) return result.error;
    const { entityId } = result.data;

    // Enforce plan limits
    const planCheck = await checkPlanLimits(db, membership.org_id, 'process_transaction');
    if (!planCheck.allowed) {
      return NextResponse.json({ error: planCheck.reason, plan: planCheck.currentPlan }, { status: 403 });
    }

    const { data: entity } = await db
      .from('entities')
      .select('id, org_id, base_currency')
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

    const { data: connections } = await db
      .from('bank_connections')
      .select('*')
      .eq('entity_id', entityId)
      .eq('status', 'active');

    if (connections && connections.length > 0) {
      const syncResults = await Promise.allSettled(
        (connections as BankConnection[]).map(async (connection) => {
          const ingestResult = await ingestTransactions(db, connection);
          return { connectionId: connection.id, ...ingestResult };
        })
      );

      for (const result of syncResults) {
        if (result.status === 'fulfilled') {
          summary.sync.transactions_added += result.value.added;
          summary.sync.transactions_modified += result.value.modified;
          summary.sync.transactions_removed += result.value.removed;
          summary.sync.connections_synced++;
        } else {
          const errorMsg = `Failed to sync connection: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`;
          summary.sync.errors.push(errorMsg);
          console.error('[Process Pipeline]', errorMsg);
        }
      }
    }

    // ── Step 1.5: Post-sync enrichment ──────────────────────────────────────
    // Wire F4 (vendor resolution), F8 (FX conversion), F12 (retention lock),
    // and F13 (created_by) into newly ingested transactions.

    const { data: freshTransactions } = await db
      .from('transactions')
      .select('id, merchant_name, currency, amount, vendor_id, created_by, retention_lock_until')
      .eq('entity_id', entityId)
      .eq('status', 'pending')
      .is('vendor_id', null);

    if (freshTransactions && freshTransactions.length > 0) {
      const baseCurrency = (entity.base_currency as string) || 'USD';
      const sevenYearsLater = new Date();
      sevenYearsLater.setFullYear(sevenYearsLater.getFullYear() + 7);
      const retentionDate = sevenYearsLater.toISOString().split('T')[0];

      const enrichResults = await Promise.allSettled(
        (freshTransactions as { id: string; merchant_name: string | null; currency: string; amount: number; vendor_id: string | null; created_by: string | null; retention_lock_until: string | null }[]).map(async (tx) => {
          const updates: Record<string, unknown> = {};

          // F13: Set created_by if missing
          if (!tx.created_by) {
            updates.created_by = user.id;
          }

          // F12: Set retention lock if missing (IRS 7-year rule)
          if (!tx.retention_lock_until) {
            updates.retention_lock_until = retentionDate;
          }

          // F4: Resolve vendor
          if (!tx.vendor_id && tx.merchant_name) {
            try {
              const vendor = await resolveOrCreateVendor(db, entityId, tx.merchant_name);
              if (vendor) {
                updates.vendor_id = vendor.id;
              }
            } catch (vendorErr) {
              console.error('[Process Pipeline] Vendor resolution failed for tx', tx.id, vendorErr);
            }
          }

          // F8: Apply FX conversion for multi-currency transactions
          if (tx.currency && tx.currency !== baseCurrency) {
            try {
              await applyFxConversion(db, tx.id, tx.currency, tx.amount, baseCurrency);
            } catch (fxErr) {
              console.error('[Process Pipeline] FX conversion failed for tx', tx.id, fxErr);
              // Flag for human review instead of silently proceeding with unconverted amount
              await db.from('transactions').update({
                status: 'human_review',
                ai_reasoning: 'FX conversion failed — manual review required',
                updated_at: new Date().toISOString(),
              }).eq('id', tx.id);
            }
          }

          // Batch update non-FX fields (FX already updates via applyFxConversion)
          if (Object.keys(updates).length > 0) {
            await db
              .from('transactions')
              .update({ ...updates, updated_at: new Date().toISOString() })
              .eq('id', tx.id)
              .eq('entity_id', entityId);
          }
        })
      );

      for (const result of enrichResults) {
        if (result.status === 'rejected') {
          console.error('[Process Pipeline] Enrichment failed:', result.reason);
        }
      }
    }

    // ── Step 2: Run AI categorization on uncategorized transactions ─────────

    const { data: pendingTransactions } = await db
      .from('transactions')
      .select('*')
      .eq('entity_id', entityId)
      .in('status', ['pending', 'human_review'])
      .is('category_ai', null);

    if (pendingTransactions && pendingTransactions.length > 0) {
      // Fetch chart of accounts
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

      // Fetch categorization rules
      const { data: rulesData } = await db
        .from('categorization_rules')
        .select('*')
        .eq('entity_id', entityId);

      const rules: CategorizationRule[] = (rulesData || []).map((r: Record<string, unknown>) => {
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
      const { data: historyData } = await db
        .from('categorization_history')
        .select('merchant, gl_code, gl_name, frequency, last_used')
        .eq('entity_id', entityId)
        .order('frequency', { ascending: false })
        .limit(100);

      const history: HistoricalPattern[] = (historyData || []).map((h: Record<string, unknown>) => ({
        merchant: h.merchant,
        glCode: h.gl_code,
        glName: h.gl_name,
        frequency: h.frequency,
        lastUsed: h.last_used,
      }));

      // Build transaction inputs
      const transactionInputs: TransactionInput[] = pendingTransactions.map(
        (t: Record<string, unknown>) => ({
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

      // Build set of transaction IDs that have a document_url (no separate table needed)
      const docAnchorSet = new Set(
        pendingTransactions
          .filter((t: Record<string, unknown>) => !!t.document_url)
          .map((t: Record<string, unknown>) => t.id as string)
      );

      // Cache triage results for reuse in history learning (step 5)
      const triageCache = new Map<string, ReturnType<typeof triageTransaction>>();

      for (const [txId, result] of results) {
        // ── Composite Confidence Gate (PRD §5.1) ──
        const hasDocument = docAnchorSet.has(txId);

        const originalTx = pendingTransactions.find((t: Record<string, unknown>) => t.id === txId);
        const txAmount = originalTx?.amount ?? 0;

        const triage = triageTransaction(
          result.confidence / 100,
          result.ruleMatchType as RuleMatchType,
          hasDocument,
          txAmount,
        );
        triageCache.set(txId, triage);

        let targetStatus = result.confidence === 0 && !result.glCode
          ? 'categorization_failed'
          : triage.targetStatus;

        // ── F20: Approval threshold check during auto-categorization ──
        // Even if confidence is high enough to auto-commit, the transaction
        // may exceed an entity-level approval threshold that requires human
        // sign-off.  Override the status and create an approval request.
        let approvalOverridden = false;
        if (triage.decision === 'auto_commit' && result.glCode) {
          try {
            const approvalCheck = await checkApprovalRequired(
              db,
              entityId,
              typeof txAmount === 'number' ? Math.abs(txAmount) : 0,
            );
            if (approvalCheck?.required) {
              targetStatus = 'human_review';
              approvalOverridden = true;
              await requestApproval(
                db,
                entityId,
                txId,
                approvalCheck.role,
                approvalCheck.thresholdId,
              );
            }
          } catch (approvalError) {
            console.error(
              '[Process Pipeline] Approval threshold check failed for tx',
              txId,
              approvalError,
            );
            // On error, fail safe: send to human review
            targetStatus = 'human_review';
            approvalOverridden = true;
          }
        }

        // ── F11: Inline fraud scoring ──────────────────────────────────
        // Before auto-approving, check for potential fraud signals:
        // 1. Duplicate detection: same vendor + similar amount (±5%) within 7 days
        // 2. Round-number suspicion: exact multiples of $100 over $500
        let fraudFlagged = false;
        if (triage.decision === 'auto_commit' && !approvalOverridden && originalTx) {
          const merchantName = (originalTx.merchant_name || originalTx.merchant_raw || '') as string;
          const absAmount = Math.abs(typeof txAmount === 'number' ? txAmount : 0);

          // Check 1: Duplicate detection — same vendor, similar amount, within 7 days
          if (merchantName && absAmount > 0) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: similarTxns } = await db
              .from('transactions')
              .select('id, amount')
              .eq('entity_id', entityId)
              .ilike('merchant_name', merchantName)
              .gte('date', sevenDaysAgo.toISOString().split('T')[0])
              .neq('id', txId)
              .neq('status', 'removed')
              .limit(5);

            if (similarTxns && similarTxns.length > 0) {
              const duplicateMatch = similarTxns.find((s: { amount: number }) => {
                const diff = Math.abs(Math.abs(s.amount) - absAmount);
                return diff / absAmount <= 0.05; // within 5%
              });

              if (duplicateMatch && absAmount >= 50) {
                fraudFlagged = true;
                targetStatus = 'human_review';
              }
            }
          }

          // Check 2: Round-number suspicion — exact multiples of $100 above $500
          if (!fraudFlagged && absAmount >= 500 && absAmount % 100 === 0) {
            fraudFlagged = true;
            targetStatus = 'human_review';
          }
        }

        if (result.confidence === 0 && !result.glCode) {
          summary.categorization.failed++;
        } else if (triage.decision === 'auto_commit' && !approvalOverridden && !fraudFlagged) {
          summary.categorization.auto_approved++;
        } else {
          summary.categorization.flagged_for_review++;
        }

        await db
          .from('transactions')
          .update({
            category_ai: result.glCode || null,
            confidence: Math.round(triage.confidence.compositeScore * 100),
            ai_reasoning: `${result.reasoning} [C_s=${triage.confidence.compositeScore.toFixed(4)}, decision=${triage.decision}${approvalOverridden ? ', approval_threshold_override' : ''}${fraudFlagged ? ', fraud_flag' : ''}]`,
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
            (t: Record<string, unknown>) => t.id === txId
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
        const { data: existingHistory } = await db
          .from('categorization_history')
          .select('merchant, gl_code, frequency')
          .eq('entity_id', entityId)
          .in('merchant', dedupedEntries.map(h => h.merchant))
          .in('gl_code', dedupedEntries.map(h => h.gl_code));

        const existingFreqMap = new Map<string, number>();
        for (const row of existingHistory || []) {
          existingFreqMap.set(`${row.merchant}:${row.gl_code}`, row.frequency || 0);
        }

        await db
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
      supabase: db,
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
