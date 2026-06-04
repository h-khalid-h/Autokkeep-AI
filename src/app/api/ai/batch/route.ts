
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/ai/batch — Batch AI Categorization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { batchCategorize } from '@/lib/ai/categorizer';
import { writeAuditLog } from '@/lib/audit';
import { triageTransaction, type RuleMatchType } from '@/lib/ai/confidence';
import { generateCitationToken } from '@/lib/ai/privacy-parser';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody, schemas } from '@/lib/validation';
import type {
  TransactionInput,
  CategorizationRule,
  ChartOfAccountsEntry,
  HistoricalPattern,
} from '@/lib/ai/categorizer';

interface BatchSummary {
  processed: number;
  auto_approved: number;
  flagged_for_review: number;
  failed: number;
}

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'ai-batch' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const result = await parseBody(request, schemas.aiBatch);
    if (!result.success) return result.error;
    const { entityId, transactionIds } = result.data;

    const { data: entity } = await db
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

    // Fetch pending transactions
    let query = db
      .from('transactions')
      .select('id, entity_id, merchant_name, merchant_raw, amount, date, mcc, currency, card_holder')
      .eq('entity_id', entityId)
      .in('status', ['pending', 'human_review']);

    if (transactionIds && transactionIds.length > 0) {
      query = query.in('id', transactionIds);
    }

    const { data: transactions, error: txError } = await query;

    if (txError) {
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    if (!transactions || transactions.length === 0) {
      const emptyResult: BatchSummary = {
        processed: 0,
        auto_approved: 0,
        flagged_for_review: 0,
        failed: 0,
      };
      return NextResponse.json(emptyResult);
    }

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
      .select('id, entity_id, match_value, mcc_code, gl_code, rule_type, priority')
      .eq('entity_id', entityId);

    const rules: CategorizationRule[] = (rulesData || []).map((r: Record<string, unknown>) => {
      // Look up gl_name from chart of accounts for this rule's GL code
      const coaEntry = chartOfAccounts.find((c: { code: string; name: string }) => c.code === r.gl_code);
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
    const transactionInputs: TransactionInput[] = transactions.map((t: Record<string, unknown>) => ({
      id: t.id,
      merchant: t.merchant_name,
      merchantRaw: t.merchant_raw,
      amount: t.amount,
      date: t.date,
      mcc: t.mcc || undefined,
      currency: t.currency || 'USD',
      cardHolder: t.card_holder || undefined,
      bankDescription: t.merchant_raw,
    }));

    // Run batch categorization
    const results = await batchCategorize(
      transactionInputs,
      rules,
      chartOfAccounts,
      history
    );

    // Update transaction records and build summary
    let autoApproved = 0;
    let flaggedForReview = 0;
    let failed = 0;
    const citationTokens: Array<{ txId: string; citationToken: string; sourceHash: string }> = [];

    // ── Pre-fetch document anchors for ALL transactions in batch (avoid N+1) ──
    const allTxIds = Array.from(results.keys());
    const { data: allDocAnchors } = await db
      .from('document_anchors')
      .select('transaction_id')
      .in('transaction_id', allTxIds);
    const docAnchorSet = new Set(
      (allDocAnchors || []).map((d: { transaction_id: string }) => d.transaction_id)
    );

    for (const [txId, result] of results) {
      // ── Composite Confidence Gate (PRD §5.1) ──
      // Check for document corroboration (pre-fetched above)
      const hasDocument = docAnchorSet.has(txId);

      // Find the original transaction amount for triage
      const originalTx = transactions.find((t: Record<string, unknown>) => t.id === txId);
      const txAmount = originalTx?.amount || 0;

      // Compute composite score and triage decision
      const triage = triageTransaction(
        result.confidence / 100, // Normalize 0-100 to 0.0-1.0
        result.ruleMatchType as RuleMatchType,
        hasDocument,
        txAmount,
      );

      const citationToken = generateCitationToken(result.sourceHash, new Date().toISOString());

      if (result.confidence === 0 && !result.glCode) {
        failed++;
      } else if (triage.decision === 'auto_commit') {
        autoApproved++;
      } else {
        flaggedForReview++;
      }

      await db
        .from('transactions')
        .update({
          category_ai: result.glCode || null,
          confidence: Math.round(triage.confidence.compositeScore * 100),
          ai_reasoning: `${result.reasoning} [C_s=${triage.confidence.compositeScore.toFixed(4)}, decision=${triage.decision}]`,
          status: triage.targetStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', txId)
        .eq('entity_id', entityId);

      // Store citation token in audit details for batch tracking
      citationTokens.push({ txId, citationToken, sourceHash: result.sourceHash });
    }

    // Log to audit with citation anchoring
    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'categorize',
      targetType: 'transaction',
      details: {
        batch: true,
        processed: results.size,
        auto_approved: autoApproved,
        flagged_for_review: flaggedForReview,
        failed,
        citations: citationTokens,
      },
      request,
    });

    const summary: BatchSummary = {
      processed: results.size,
      auto_approved: autoApproved,
      flagged_for_review: flaggedForReview,
      failed,
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[AI Batch] Error:', error);
    return NextResponse.json(
      { error: 'Batch categorization failed' },
      { status: 500 }
    );
  }
}
