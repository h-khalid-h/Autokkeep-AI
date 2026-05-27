
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/plaid/sync — Sync Transactions for a Bank Connection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { syncTransactions } from '@/lib/plaid/client';
import { categorizeTransaction } from '@/lib/ai/categorizer';
import { apiLimiter } from '@/lib/rate-limit';
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
    // Rate limit
    const limit = apiLimiter(request);
    if (limit && !limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
      );
    }

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

    // Sync transactions from Plaid
    const syncResult = await syncTransactions(
      connection.plaid_access_token,
      connection.cursor || undefined
    );

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

    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;

    // Process added transactions
    for (const t of syncResult.added) {
      const transactionInput: TransactionInput = {
        id: t.transaction_id,
        merchant: t.merchant_name || t.name,
        merchantRaw: t.name,
        amount: t.amount,
        date: t.date,
        mcc: undefined,
        currency: t.iso_currency_code || 'USD',
        bankDescription: t.name,
      };

      // Run AI categorization on each new transaction
      const result = await categorizeTransaction(
        transactionInput,
        catRules,
        coaEntries,
        history
      );

      const status =
        result.confidence >= 95 ? 'auto_categorized' : 'human_review';

      const { error: insertError } = await (supabase as any)
        .from('transactions')
        .upsert({
          entity_id: entity.id,
          bank_account_id: t.account_id,
          plaid_transaction_id: t.transaction_id,
          amount: t.amount,
          date: t.date,
          merchant_name: t.merchant_name || t.name,
          merchant_raw: t.name,
          currency: t.iso_currency_code || 'USD',
          category_ai: result.glCode || null,
          confidence: result.confidence,
          ai_reasoning: result.glName ? `${result.reasoning} [GL Name: ${result.glName}]` : result.reasoning,
          status,
        }, { onConflict: 'plaid_transaction_id', ignoreDuplicates: true });

      if (!insertError) addedCount++;
    }

    // Process modified transactions — clear AI categorization for re-processing
    for (const t of syncResult.modified) {
      const { error: updateError } = await (supabase as any)
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
        .eq('entity_id', entity.id);

      if (!updateError) modifiedCount++;
    }

    // Process removed transactions (soft delete)
    for (const t of syncResult.removed) {
      const { error: deleteError } = await (supabase as any)
        .from('transactions')
        .update({
          status: 'removed',
          updated_at: new Date().toISOString(),
        })
        .eq('plaid_transaction_id', t.transaction_id)
        .eq('entity_id', entity.id);

      if (!deleteError) removedCount++;
    }

    // Update cursor on bank_connection
    await (supabase as any)
      .from('bank_connections')
      .update({
        cursor: syncResult.nextCursor,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    return NextResponse.json({
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
    });
  } catch (error) {
    console.error('[Plaid Sync] Error:', error);
    return NextResponse.json(
      { error: 'Failed to sync transactions' },
      { status: 500 }
    );
  }
}
