
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/plaid/sync — Sync Transactions for a Bank Connection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { captureException } from '@/lib/sentry';
import { ingestTransactions } from '@/lib/plaid/ingest';
import { rateLimit } from '@/lib/rate-limit';
import { categorizeTransaction } from '@/lib/ai/categorizer';
import { triageTransaction, type RuleMatchType } from '@/lib/ai/confidence';
import { parseBody, schemas } from '@/lib/validation';
import type {
  TransactionInput,
  CategorizationRule,
  ChartOfAccountsEntry,
  HistoricalPattern,
} from '@/lib/ai/categorizer';


export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'plaid-sync' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const bodyResult = await parseBody(request, schemas.plaidSync);
    if (!bodyResult.success) return bodyResult.error;
    const { connectionId } = bodyResult.data;

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId is required' },
        { status: 400 }
      );
    }

    // Fetch bank connection
    const { data: connection, error: connError } = await db
      .from('bank_connections')
      .select('id, entity_id, plaid_access_token, institution_name, cursor, status, last_synced_at')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'Bank connection not found' },
        { status: 404 }
      );
    }

    // Validate entity access
    const { data: entity } = await db
      .from('entities')
      .select('id, org_id')
      .eq('id', connection.entity_id)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity access denied' },
        { status: 403 }
      );
    }

    // ── 1. Sync + upsert + cursor via shared ingestion ──────────────────
    const ingestResult = await ingestTransactions(db, connection);

    // ── 2. AI categorization pass on uncategorized pending transactions ──
    const { data: pendingTxns } = await db
      .from('transactions')
      .select('*')
      .eq('entity_id', entity.id)
      .eq('status', 'pending')
      .is('category_ai', null);

    const txnsToCateg = pendingTxns || [];

    if (txnsToCateg.length > 0) {
      // Fetch entity's chart of accounts and categorization rules
      const { data: chartOfAccountsData } = await db
        .from('chart_of_accounts')
        .select('code, name')
        .eq('entity_id', entity.id);

      const { data: rulesData } = await db
        .from('categorization_rules')
        .select('*')
        .eq('entity_id', entity.id);

      // Fetch historical patterns
      const { data: historyData } = await db
        .from('categorization_history')
        .select('merchant, gl_code, gl_name, frequency, last_used')
        .eq('entity_id', entity.id)
        .order('frequency', { ascending: false })
        .limit(100);

      const history: HistoricalPattern[] = (historyData || []).map((h: { merchant: string; gl_code: string; gl_name: string; frequency: number; last_used: string }) => ({
        merchant: h.merchant,
        glCode: h.gl_code,
        glName: h.gl_name,
        frequency: h.frequency,
        lastUsed: h.last_used,
      }));

      const coaEntries: ChartOfAccountsEntry[] = (
        chartOfAccountsData || []
      ).map((c: { code: string; name: string }) => ({
        code: c.code,
        name: c.name,
      }));

      const catRules: CategorizationRule[] = (rulesData || []).map((r: { id: string; match_value: string; mcc_code?: string; gl_code: string; rule_type?: string; priority?: number }) => ({
        id: r.id,
        vendor_pattern: r.match_value,
        mcc_code: r.mcc_code || undefined,
        gl_code: r.gl_code,
        gl_name: '',
        match_type: r.rule_type || 'contains',
        priority: r.priority || 0,
      }));

      for (const txn of txnsToCateg) {
        const transactionInput: TransactionInput = {
          id: txn.plaid_transaction_id,
          merchant: txn.merchant_name,
          merchantRaw: txn.merchant_raw,
          amount: txn.amount,
          date: txn.date,
          mcc: undefined,
          currency: txn.currency || 'USD',
          bankDescription: txn.merchant_raw,
        };

        const result = await categorizeTransaction(
          transactionInput,
          catRules,
          coaEntries,
          history
        );

        // ── Composite Confidence Gate (PRD §5.1) ──
        const triage = triageTransaction(
          result.confidence / 100,
          result.ruleMatchType as RuleMatchType,
          false, // no document yet
          txn.amount || 0,
        );

        await db
          .from('transactions')
          .update({
            category_ai: result.glCode || null,
            confidence: Math.round(triage.confidence.compositeScore * 100),
            ai_reasoning: `${result.reasoning} [C_s=${triage.confidence.compositeScore.toFixed(4)}, decision=${triage.decision}]`,
            status: triage.targetStatus,
          })
          .eq('id', txn.id);
      }
    }

    return NextResponse.json({
      added: ingestResult.added,
      modified: ingestResult.modified,
      removed: ingestResult.removed,
      categorized: txnsToCateg.length,
    });
  } catch (error) {
    captureException(error, { tags: { route: 'plaid/sync' } });
    console.error('[Plaid Sync] Error:', error);
    return NextResponse.json(
      { error: 'Failed to sync transactions' },
      { status: 500 }
    );
  }
}
