
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/plaid-sync — Automated Plaid Transaction Sync (Cron)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { captureException } from '@/lib/sentry';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestTransactions } from '@/lib/plaid/ingest';
import { analyzeVariance, createFeeAdjustingEntry } from '@/lib/reconciliation/engine';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Fetch all active bank connections
    const { data: connections, error: connError } = await db
      .from('bank_connections')
      .select('id, entity_id, plaid_item_id, plaid_access_token, cursor, institution_name, status')
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

    // Track successfully synced entity IDs for reconciliation
    const syncedEntityIds = new Set<string>();

    for (const connection of connections) {
      try {
        const _result = await ingestTransactions(db, connection);
        syncedCount++;
        syncedEntityIds.add(connection.entity_id as string);
      } catch (err: unknown) {
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

    // ── Reconciliation: analyze variances for synced entities ─────────
    for (const entityId of syncedEntityIds) {
      try {
        // Fetch recently ingested transactions that have linked expected amounts
        const { data: txns } = await db
          .from('transactions')
          .select('id, entity_id, amount, expected_amount, merchant_name, date')
          .eq('entity_id', entityId)
          .eq('status', 'pending')
          .not('expected_amount', 'is', null)
          .limit(100);

        if (!txns || txns.length === 0) continue;

        for (const txn of txns) {
          const bankAmount = Number(txn.amount);
          const expectedAmount = Number(txn.expected_amount);
          if (Math.abs(bankAmount - expectedAmount) < 0.01) continue;

          const analysis = analyzeVariance(bankAmount, expectedAmount, txn.merchant_name || '');
          if (!analysis.isKnownFee) continue;

          await createFeeAdjustingEntry(db, {
            transactionId: txn.id as string,
            entityId: entityId,
            bankAmount,
            expectedAmount,
            merchantName: txn.merchant_name || 'Unknown',
            date: txn.date as string,
          });
        }
      } catch (reconErr) {
        console.error(`[Cron Plaid Sync] Reconciliation error for entity ${entityId}:`, reconErr);
      }
    }

    // Audit log the cron run
    if (connections.length > 0) {
      await writeAuditLog({
        supabase: db,
        entityId: undefined,
        actorId: 'system',
        actorType: 'system',
        action: 'sync',
        targetType: 'plaid_sync',
        details: {
          synced: syncedCount,
          failed: failedCount,
          total: connections.length,
          entity_ids: [...new Set(connections.map((c: Record<string, unknown>) => c.entity_id))],
        },
        request,
      });
    }

    return NextResponse.json({
      synced: syncedCount,
      failed: failedCount,
      total: connections.length,
      errors,
    });
  } catch (error) {
    captureException(error, { tags: { route: 'cron/plaid-sync' } });
    console.error('[Cron Plaid Sync] Error:', error);
    return NextResponse.json(
      { error: 'Cron sync failed' },
      { status: 500 }
    );
  }
}
