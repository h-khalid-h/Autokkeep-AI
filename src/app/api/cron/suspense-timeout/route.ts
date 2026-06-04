
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/suspense-timeout — 48h Unresolved → Escrow Suspense
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Runs on a schedule (e.g. every 4 hours). Finds transactions stuck in
// 'human_review' for more than 48 hours and moves them to 'escrow_suspense'.
// Creates a journal entry to the Suspense Clearing Account for each.

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';
import { captureException } from '@/lib/sentry';
import { getGLCode } from '@/lib/entity-settings';
import { rateLimit } from '@/lib/rate-limit';

// GL codes are now entity-configurable via entity_settings table.
// These constants serve only as type-safe key references for getGLCode().
const SUSPENSE_TIMEOUT_HOURS = 48;

interface StaleTransaction {
  id: string;
  entity_id: string;
  amount: number;
  merchant_name: string | null;
  date: string;
  category_ai: string | null;
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'cron-suspense-timeout' });
    if (limited) return limited;

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Find transactions stuck in human_review for > 48 hours
    const cutoffDate = new Date(
      Date.now() - SUSPENSE_TIMEOUT_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data, error: fetchError } = await db
      .from('transactions')
      .select('id, entity_id, amount, merchant_name, date, category_ai')
      .eq('status', 'human_review')
      .lt('updated_at', cutoffDate);

    const staleTransactions = data as StaleTransaction[] | null;

    if (fetchError) {
      console.error('[Suspense Timeout] Failed to fetch stale transactions:', fetchError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    if (!staleTransactions || staleTransactions.length === 0) {
      return NextResponse.json({
        moved: 0,
        message: 'No stale transactions found',
      });
    }

    const now = new Date().toISOString();
    const txnIds = staleTransactions.map((t) => t.id);

    // 1. Batch update all stale transactions to escrow_suspense
    //    Note: ai_reasoning per-transaction is set below via individual updates
    //    since each needs a unique message. We batch the status update first.
    const aiReasoningUpdates = staleTransactions.map((txn) =>
      db
        .from('transactions')
        .update({
          status: 'escrow_suspense',
          ai_reasoning: `Auto-moved to suspense: unresolved for >${SUSPENSE_TIMEOUT_HOURS}h. Original AI suggestion: ${txn.category_ai || 'none'}`,
          updated_at: now,
        })
        .eq('id', txn.id)
    );
    await Promise.all(aiReasoningUpdates);

    // 2. Validate GL codes exist per entity before creating journal entries
    //    Group transactions by entity to batch-validate chart of accounts
    const entitiesWithTxns = new Map<string, StaleTransaction[]>();
    for (const txn of staleTransactions) {
      const existing = entitiesWithTxns.get(txn.entity_id) || [];
      existing.push(txn);
      entitiesWithTxns.set(txn.entity_id, existing);
    }

    const validatedTxns: StaleTransaction[] = [];
    const skippedEntities: string[] = [];

    for (const [entityId, entityTxns] of entitiesWithTxns) {
      // Resolve GL codes per entity (falls back to defaults if no override)
      const suspenseGL = await getGLCode(db, entityId, 'suspense_gl');
      const contraGL = await getGLCode(db, entityId, 'cash_gl');

      // Check if the resolved GL codes exist in this entity's CoA.
      const { data: glAccounts } = await db
        .from('chart_of_accounts')
        .select('code')
        .eq('entity_id', entityId)
        .in('code', [suspenseGL, contraGL]);

      const existingCodes = new Set((glAccounts || []).map((a: { code: string }) => a.code));
      if (!existingCodes.has(suspenseGL) || !existingCodes.has(contraGL)) {
        console.warn(
          `[Suspense Timeout] Skipping ${entityTxns.length} txns for entity ${entityId}: ` +
          `GL codes ${suspenseGL} and/or ${contraGL} not in chart of accounts`
        );
        skippedEntities.push(entityId);
        continue;
      }

      // Tag each transaction with its resolved GL codes for journal line creation
      for (const txn of entityTxns) {
        (txn as StaleTransaction & { _suspenseGL: string; _contraGL: string })._suspenseGL = suspenseGL;
        (txn as StaleTransaction & { _contraGL: string })._contraGL = contraGL;
      }
      validatedTxns.push(...entityTxns);
    }

    // 3. Batch insert journal entries for validated transactions only
    const journalRecords = validatedTxns.map((txn) => ({
      entity_id: txn.entity_id,
      transaction_id: txn.id,
      entry_date: txn.date,
      memo: `Suspense: ${txn.merchant_name || 'Unknown'} — pending review`,
      status: 'draft',
      created_at: now,
    }));

    let journalEntries: { id: string; transaction_id: string }[] | null = null;
    if (journalRecords.length > 0) {
      const result = await db
        .from('journal_entries')
        .insert(journalRecords)
        .select('id, transaction_id');
      journalEntries = result.data;
    }

    // 4. Batch insert all journal lines (debit + credit pairs)
    if (journalEntries && journalEntries.length > 0) {
      // Build a map from transaction_id → journal_entry_id
      const jeMap = new Map<string, string>();
      for (const je of journalEntries) {
        jeMap.set(je.transaction_id, je.id);
      }

      const journalLines: Array<{
        journal_entry_id: string;
        gl_code: string;
        debit: number;
        credit: number;
        description: string;
      }> = [];

      for (const txn of validatedTxns) {
        const jeId = jeMap.get(txn.id);
        if (!jeId) continue;
        const absAmount = Math.abs(txn.amount);
        const tagged = txn as StaleTransaction & { _suspenseGL: string; _contraGL: string };
        journalLines.push(
          {
            journal_entry_id: jeId,
            gl_code: tagged._suspenseGL,
            debit: absAmount,
            credit: 0,
            description: `Suspense hold: ${txn.merchant_name || 'Unknown'}`,
          },
          {
            journal_entry_id: jeId,
            gl_code: tagged._contraGL,
            debit: 0,
            credit: absAmount,
            description: `Suspense contra: pending classification`,
          },
        );
      }

      if (journalLines.length > 0) {
        await db.from('journal_lines').insert(journalLines);
      }
    }

    // 5. Build a journal entry lookup for audit details
    const jeMapForAudit = new Map<string, string>();
    if (journalEntries) {
      for (const je of journalEntries) {
        jeMapForAudit.set(je.transaction_id, je.id);
      }
    }

    // Batch audit logs via Promise.all
    await Promise.all(
      staleTransactions.map((txn) =>
        writeAuditLog({
          supabase: db,
          entityId: txn.entity_id,
          actorId: undefined,
          actorType: 'system',
          action: 'update',
          targetType: 'transaction',
          targetId: txn.id,
          details: {
            action: 'suspense_timeout',
            reason: `Unresolved for >${SUSPENSE_TIMEOUT_HOURS} hours`,
            previous_status: 'human_review',
            new_status: 'escrow_suspense',
            journal_entry_id: jeMapForAudit.get(txn.id) || null,
          },
          request,
        })
      )
    );

    const movedCount = txnIds.length;
    const errors: string[] = [];


    return NextResponse.json({
      moved: movedCount,
      total_stale: staleTransactions.length,
      skipped_entities: skippedEntities.length,
      errors,
    });
  } catch (error: unknown) {
    captureException(error, { tags: { route: 'cron/suspense-timeout' } });
    console.error('[Suspense Timeout] Error:', error);
    return NextResponse.json(
      { error: 'Suspense timeout cron failed' },
      { status: 500 }
    );
  }
}
