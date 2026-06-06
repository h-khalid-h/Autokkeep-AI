
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/plaid-sync — Automated Plaid Transaction Sync (Cron)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { withSentryHandler } from '@/lib/sentry';
import { handleApiError } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestTransactions, type BankConnection } from '@/lib/plaid/ingest';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { verifyCronAuth } from '@/lib/cron-auth';

async function handler(request: NextRequest) {
  try {
    // Verify cron secret (timing-safe)
    const cronError = verifyCronAuth(request);
    if (cronError) return cronError;

    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'cron-plaid-sync' });
    if (limited) return limited;

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Fetch active connections AND errored connections (older than 1 hour) for retry.
    // Errored connections from transient failures (e.g., Plaid downtime) deserve
    // automatic retry after a cooldown period.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: connections, error: connError } = await db
      .from('bank_connections')
      .select('id, entity_id, plaid_item_id, plaid_access_token, cursor, institution_name, status')
      .or(`status.eq.active,and(status.eq.error,updated_at.lt.${oneHourAgo})`)
      .limit(500);

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

    // Process connections concurrently (max 5 at a time) to avoid timeout
    const CONCURRENCY_LIMIT = 5;
    const results: Array<{ connectionId: string; success: boolean; error?: string }> = [];

    for (let i = 0; i < connections.length; i += CONCURRENCY_LIMIT) {
      const batch = connections.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.allSettled(
        batch.map(async (connection: BankConnection) => {
          await ingestTransactions(db, connection);
          return connection.id;
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const connId = batch[j].id;
        if (result.status === 'fulfilled') {
          syncedCount++;
          results.push({ connectionId: connId, success: true });

          // If this was an errored connection that synced successfully, restore to active
          if (batch[j].status === 'error') {
            await db
              .from('bank_connections')
              .update({ status: 'active', updated_at: new Date().toISOString() })
              .eq('id', connId);
            console.log(`[Cron Plaid Sync] Restored errored connection ${connId} to active`);
          }
        } else {
          failedCount++;
          const errorMessage =
            result.reason instanceof Error ? result.reason.message : 'Unknown error';
          errors.push({ connectionId: connId, error: errorMessage });
          results.push({ connectionId: connId, success: false, error: errorMessage });
          console.error(
            `[Cron Plaid Sync] Failed to sync connection ${connId}:`,
            result.reason
          );
        }
      }
    }

    // NOTE: Reconciliation (variance analysis / fee adjusting entries) is disabled
    // until the schema supports `expected_amount` on the transactions table.
    // See: analyzeVariance() and createFeeAdjustingEntry() in lib/reconciliation/engine.

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
    return handleApiError(error, 'cron/plaid-sync', 'Cron sync failed');
  }
}

export const GET = withSentryHandler(handler, { routeName: 'cron/plaid-sync' });
