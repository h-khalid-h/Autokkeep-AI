
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/plaid/sync — Sync Transactions for a Bank Connection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { createServerClient } from '@/lib/supabase/server';
import { ingestTransactions } from '@/lib/plaid/ingest';
import { rateLimit } from '@/lib/rate-limit';
import { categorizeTransaction } from '@/lib/ai/categorizer';
import { triageTransaction, type RuleMatchType } from '@/lib/ai/confidence';
import type {
  TransactionInput,
  CategorizationRule,
  ChartOfAccountsEntry,
  HistoricalPattern,
} from '@/lib/ai/categorizer';

interface SyncRequestBody {
  connectionId: string;
}

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'plaid-sync' });
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

    const body: SyncRequestBody = await request.json();
    const { connectionId } = body;

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId is required' },
        { status: 400 }
      );
    }

    // Fetch bank connection
    const { data: connection, error: connError } = await (supabase as any)
      .from('bank_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'Bank connection not found' },
        { status: 404 }
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

    const { data: entity } = await (supabase as any)
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
    const ingestResult = await ingestTransactions(supabase as any, connection);

    // ── 2. AI categorization pass on uncategorized pending transactions ──
    const { data: pendingTxns } = await (supabase as any)
      .from('transactions')
      .select('*')
      .eq('entity_id', entity.id)
      .eq('status', 'pending')
      .is('category_ai', null);

    const txnsToCateg = pendingTxns || [];

    if (txnsToCateg.length > 0) {
      // Fetch entity's chart of accounts and categorization rules
      const { data: chartOfAccountsData } = await (supabase as any)
        .from('chart_of_accounts')
        .select('code, name')
        .eq('entity_id', entity.id);

      const { data: rulesData } = await (supabase as any)
        .from('categorization_rules')
        .select('*')
        .eq('entity_id', entity.id);

      // Fetch historical patterns
      const { data: historyData } = await (supabase as any)
        .from('categorization_history')
        .select('merchant, gl_code, gl_name, frequency, last_used')
        .eq('entity_id', entity.id)
        .order('frequency', { ascending: false })
        .limit(100);

      const history: HistoricalPattern[] = (historyData || []).map((h: Record<string, any>) => ({
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

      const catRules: CategorizationRule[] = (rulesData || []).map((r: Record<string, any>) => ({
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

        await (supabase as any)
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
