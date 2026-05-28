
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/plaid-sync — Automated Plaid Transaction Sync (Cron)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncTransactions } from '@/lib/plaid/client';

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Fetch all active bank connections
    const { data: connections, error: connError } = await (supabase as any)
      .from('bank_connections')
      .select('*')
      .eq('status', 'active');

    if (connError) {
      console.error('[Cron Plaid Sync] Failed to fetch connections:', connError);
      return NextResponse.json(
        { error: 'Failed to fetch bank connections' },
        { status: 500 }
      );
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({
        synced: 0,
        failed: 0,
        errors: [],
        message: 'No active bank connections found',
      });
    }

    let syncedCount = 0;
    let failedCount = 0;
    const errors: Array<{ connectionId: string; error: string }> = [];

    for (const connection of connections) {
      try {
        // Sync transactions from Plaid
        const syncResult = await syncTransactions(
          connection.plaid_access_token,
          connection.cursor || undefined
        );

        // Process added transactions
        for (const t of syncResult.added) {
          await (supabase as any)
            .from('transactions')
            .upsert(
              {
                entity_id: connection.entity_id,
                bank_account_id: t.account_id,
                plaid_transaction_id: t.transaction_id,
                amount: t.amount,
                date: t.date,
                merchant_name: t.merchant_name || t.name,
                merchant_raw: t.name,
                currency: t.iso_currency_code || 'USD',
                status: 'pending',
              },
              { onConflict: 'plaid_transaction_id', ignoreDuplicates: true }
            );
        }

        // Process modified transactions — clear AI categorization for re-processing
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
            .eq('entity_id', connection.entity_id);
        }

        // Process removed transactions (soft delete)
        for (const t of syncResult.removed) {
          await (supabase as any)
            .from('transactions')
            .update({
              status: 'removed',
              updated_at: new Date().toISOString(),
            })
            .eq('plaid_transaction_id', t.transaction_id)
            .eq('entity_id', connection.entity_id);
        }

        // Update cursor on bank_connection
        await (supabase as any)
          .from('bank_connections')
          .update({
            cursor: syncResult.nextCursor,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        syncedCount++;
      } catch (err) {
        failedCount++;
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        errors.push({ connectionId: connection.id, error: errorMessage });
        console.error(
          `[Cron Plaid Sync] Failed to sync connection ${connection.id}:`,
          err
        );
      }
    }

    return NextResponse.json({
      synced: syncedCount,
      failed: failedCount,
      total: connections.length,
      errors,
    });
  } catch (error) {
    console.error('[Cron Plaid Sync] Error:', error);
    return NextResponse.json(
      { error: 'Cron sync failed' },
      { status: 500 }
    );
  }
}
