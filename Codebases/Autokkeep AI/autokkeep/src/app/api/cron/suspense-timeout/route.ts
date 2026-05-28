
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/suspense-timeout — 48h Unresolved → Escrow Suspense
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Runs on a schedule (e.g. every 4 hours). Finds transactions stuck in
// 'human_review' for more than 48 hours and moves them to 'escrow_suspense'.
// Creates a journal entry to the Suspense Clearing Account for each.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';

const SUSPENSE_GL_CODE = '2900'; // Suspense/Clearing account
const SUSPENSE_TIMEOUT_HOURS = 48;

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Find transactions stuck in human_review for > 48 hours
    const cutoffDate = new Date(
      Date.now() - SUSPENSE_TIMEOUT_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data: staleTransactions, error: fetchError } = await (supabase as any)
      .from('transactions')
      .select('id, entity_id, amount, merchant_name, date, category_ai')
      .eq('status', 'human_review')
      .lt('created_at', cutoffDate);

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

    let movedCount = 0;
    const errors: string[] = [];

    for (const txn of staleTransactions) {
      try {
        // 1. Move transaction to escrow_suspense
        await (supabase as any)
          .from('transactions')
          .update({
            status: 'escrow_suspense',
            ai_reasoning: `Auto-moved to suspense: unresolved for >${SUSPENSE_TIMEOUT_HOURS}h. Original AI suggestion: ${txn.category_ai || 'none'}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', txn.id);

        // 2. Create a suspense journal entry (debit suspense, credit TBD)
        const { data: journalEntry } = await (supabase as any)
          .from('journal_entries')
          .insert({
            entity_id: txn.entity_id,
            transaction_id: txn.id,
            entry_date: txn.date,
            memo: `Suspense: ${txn.merchant_name || 'Unknown'} — $${Math.abs(txn.amount).toFixed(2)} — pending CPA review`,
            status: 'draft',
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (journalEntry) {
          // Balanced double-entry: debit Suspense, credit the bank/cash clearing account
          // We always credit '1010' (Cash & Bank) since the money has already left the bank.
          // The suspense account holds the debit until a CPA classifies it.
          const absAmount = Math.abs(txn.amount);

          await (supabase as any)
            .from('journal_lines')
            .insert([
              {
                journal_entry_id: journalEntry.id,
                gl_code: SUSPENSE_GL_CODE,
                debit: absAmount,
                credit: 0,
                description: `Suspense hold: ${txn.merchant_name || 'Unknown'}`,
              },
              {
                journal_entry_id: journalEntry.id,
                gl_code: '1010', // Cash & Bank — always use as contra
                debit: 0,
                credit: absAmount,
                description: `Suspense contra: pending classification`,
              },
            ]);
        }

        // 3. Log to audit trail
        await (supabase as any).from('audit_log').insert({
          entity_id: txn.entity_id,
          action: 'update',
          target_type: 'transaction',
          target_id: txn.id,
          actor_type: 'system',
          details: {
            action: 'suspense_timeout',
            reason: `Unresolved for >${SUSPENSE_TIMEOUT_HOURS} hours`,
            previous_status: 'human_review',
            new_status: 'escrow_suspense',
            journal_entry_id: journalEntry?.id || null,
          },
        });

        movedCount++;
      } catch (err) {
        const msg = `Failed to move txn ${txn.id}: ${err instanceof Error ? err.message : 'Unknown'}`;
        errors.push(msg);
        console.error('[Suspense Timeout]', msg);
      }
    }

    // Audit log the cron run
    if (movedCount > 0) {
      for (const txn of staleTransactions.slice(0, movedCount)) {
        await writeAuditLog({
          supabase,
          entityId: txn.entity_id,
          actorId: 'system',
          actorType: 'system',
          action: 'update',
          targetType: 'transaction',
          targetId: txn.id,
          details: { from_status: 'human_review', to_status: 'escrow_suspense', reason: '48h_timeout' },
          request,
        });
      }
    }

    return NextResponse.json({
      moved: movedCount,
      total_stale: staleTransactions.length,
      errors,
    });
  } catch (error) {
    console.error('[Suspense Timeout] Error:', error);
    return NextResponse.json(
      { error: 'Suspense timeout cron failed' },
      { status: 500 }
    );
  }
}
