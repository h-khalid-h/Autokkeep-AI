
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/ai/categorize — Single Transaction AI Categorization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { categorizeTransaction } from '@/lib/ai/categorizer';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { triageTransaction, type RuleMatchType } from '@/lib/ai/confidence';
import { generateCitationToken } from '@/lib/ai/privacy-parser';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
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
    // Rate limit: 20 requests per minute per IP
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'ai-categorize' });
    if (limited) return limited;

    const supabase = await createServerClient();
    const db = supabase as unknown as SupabaseQueryClient;

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
    const { data: membership } = await db
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

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

    const rules: CategorizationRule[] = (rulesData || []).map((r: Record<string, any>) => {  // eslint-disable-line @typescript-eslint/no-explicit-any
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

    const history: HistoricalPattern[] = (historyData || []).map((h: Record<string, any>) => ({  // eslint-disable-line @typescript-eslint/no-explicit-any
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

    // ── Composite Confidence Gate (PRD §5.1) ──
    // Determine rule match type for C_s calculation
    const ruleMatchType = result.ruleMatchType;
    
    // Check for document corroboration (receipt/invoice exists for this transaction)
    let hasDocument = false;
    if (transaction.id) {
      const { data: docAnchor } = await db
        .from('document_anchors')
        .select('id')
        .eq('transaction_id', transaction.id)
        .limit(1);
      hasDocument = (docAnchor && docAnchor.length > 0);
    }

    // Compute composite score and triage decision
    const triage = triageTransaction(
      result.confidence / 100, // Normalize 0-100 to 0.0-1.0
      ruleMatchType as RuleMatchType,
      hasDocument,
      transaction.amount,
    );

    const citationToken = generateCitationToken(result.sourceHash, new Date().toISOString());

    // Update the transaction record with triage results
    if (transaction.id) {
      await db
        .from('transactions')
        .update({
          category_ai: result.glCode || null,
          confidence: Math.round(triage.confidence.compositeScore * 100),
          ai_reasoning: `${result.reasoning} [C_s=${triage.confidence.compositeScore.toFixed(4)}, decision=${triage.decision}]`,
          status: triage.targetStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id)
        .eq('entity_id', entityId);
    }

    // Log to audit with citation anchoring (PRD §4.1)
    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'categorize',
      targetType: 'transaction',
      targetId: transaction.id || undefined,
      details: {
        engine: result.engine,
        confidence: triage.confidence,
        category_ai: result.glCode,
        triage_decision: triage.decision,
        notification_channel: triage.notificationChannel,
        source_hash: result.sourceHash,
        citation_token: citationToken,
      },
      request,
    });
    // ── Dispatch alerts for high-risk transactions (PRD §4.2) ──────────────
    if (triage.decision === 'freeze_review' && process.env.RESEND_API_KEY) {
      try {
        const { sendAlertEmail } = await import('@/lib/email/resend');
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const adminSupabase = createAdminClient();
        const adminDb = adminSupabase as unknown as SupabaseQueryClient;

        // Get entity admin email
        const { data: members } = await adminDb
          .from('entity_memberships')
          .select('user_id, role, users:user_id(email)')
          .eq('entity_id', entityId)
          .in('role', ['owner', 'admin'])
          .limit(1);

        const adminEmail = (members?.[0]?.users as unknown as { email: string })?.email;
        if (adminEmail) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autokkeep.com';
          await sendAlertEmail({
            to: adminEmail,
            merchantName: transaction.merchant || transaction.merchantRaw || 'Unknown',
            amount: transaction.amount,
            confidence: Math.round(triage.confidence.compositeScore * 100),
            reasoning: result.reasoning,
            approveUrl: `${appUrl}/transactions?action=approve&id=${transaction.id}`,
            rejectUrl: `${appUrl}/transactions?action=reject&id=${transaction.id}`,
          });
          console.info(`[AI Categorize] Alert email sent to ${adminEmail} for $${transaction.amount} transaction`);
        }
      } catch (alertError) {
        // Don't fail the categorization if alert dispatch fails
        console.error('[AI Categorize] Alert dispatch failed:', alertError);
      }
    }

    return NextResponse.json({
      ...result,
      triage: {
        decision: triage.decision,
        compositeScore: triage.confidence.compositeScore,
        confidence: triage.confidence,
        targetStatus: triage.targetStatus,
        notificationChannel: triage.notificationChannel,
      },
      citationToken,
    });
  } catch (error) {
    console.error('[AI Categorize] Error:', error);
    return NextResponse.json(
      { error: 'Categorization failed' },
      { status: 500 }
    );
  }
}
