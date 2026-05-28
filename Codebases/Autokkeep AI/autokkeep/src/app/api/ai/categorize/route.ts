
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/ai/categorize — Single Transaction AI Categorization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { categorizeTransaction } from '@/lib/ai/categorizer';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import type {
  TransactionInput,
  CategorizationRule,
  ChartOfAccountsEntry,
  HistoricalPattern,
} from '@/lib/ai/categorizer';

interface CategorizeRequestBody {
  transaction: {
    id?: string;
    merchant: string;
    merchantRaw?: string;
    merchant_raw?: string;
    amount: number;
    date: string;
    mcc?: string;
    currency?: string;
    cardHolder?: string;
    card_holder?: string;
    bankDescription?: string;
    rawData?: {
      mcc?: string;
      currency?: string;
      bankDescription?: string;
    };
  };
  entityId: string;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 30 requests per minute per IP
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'ai' });
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


    const body: CategorizeRequestBody = await request.json();
    const { transaction, entityId } = body;

    if (!transaction || !entityId) {
      return NextResponse.json(
        { error: 'transaction and entityId are required' },
        { status: 400 }
      );
    }

    if (transaction.amount === undefined || transaction.amount === null || !transaction.merchant) {
      return NextResponse.json(
        { error: 'Transaction with amount and merchant_name is required' },
        { status: 400 }
      );
    }

    if (!transaction.date) {
      return NextResponse.json(
        { error: 'Transaction date is required' },
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

    // Build transaction input
    const transactionInput: TransactionInput = {
      id: transaction.id || crypto.randomUUID(),
      merchant: transaction.merchant,
      merchantRaw: transaction.merchantRaw || transaction.merchant_raw,
      amount: transaction.amount,
      date: transaction.date,
      mcc: transaction.mcc || transaction.rawData?.mcc,
      currency:
        transaction.currency || transaction.rawData?.currency || 'USD',
      cardHolder: transaction.cardHolder || transaction.card_holder,
      bankDescription:
        transaction.bankDescription ||
        transaction.rawData?.bankDescription,
    };

    // Run categorization
    const result = await categorizeTransaction(
      transactionInput,
      rules,
      chartOfAccounts,
      history
    );

    // Update the transaction record with AI results
    if (transaction.id) {
      await (supabase as any)
        .from('transactions')
        .update({
          category_ai: result.glCode || null,
          confidence: result.confidence,
          ai_reasoning: result.glName ? `${result.reasoning} [GL Name: ${result.glName}]` : result.reasoning,
          status: result.confidence >= 95 ? 'auto_categorized' : 'human_review',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id)
        .eq('entity_id', entityId);
    }

    // Log to audit
    await writeAuditLog({
      supabase,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'categorize',
      targetType: 'transaction',
      targetId: transaction.id || undefined,
      details: {
        engine: result.engine,
        confidence: result.confidence,
        category_ai: result.glCode,
      },
      request,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[AI Categorize] Error:', error);
    return NextResponse.json(
      { error: 'Categorization failed' },
      { status: 500 }
    );
  }
}
