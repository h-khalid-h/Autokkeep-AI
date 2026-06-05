
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/token-refresh — OAuth Token Refresh (Cron)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { withSentryHandler } from '@/lib/sentry';
import { handleApiError } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  refreshConnectionToken,
  computeTokenExpiresAt,
  type LedgerConnectionRow,
  type TokenRefreshResult,
} from '@/lib/ledger/token-refresh';
import { writeAuditLog } from '@/lib/audit';
import { encryptToken } from '@/lib/crypto';
import { rateLimit } from '@/lib/rate-limit';

async function handler(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'cron-token-refresh' });
    if (limited) return limited;

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // ── Fetch connections with tokens expiring within 24 hours ──────────
    const expiryThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: connections, error: connError } = await db
      .from('ledger_connections')
      .select('id, entity_id, provider, access_token, refresh_token, realm_id, tenant_id, is_active, token_expires_at, refresh_failures')
      .eq('is_active', true)
      .not('refresh_token', 'is', null)
      .lt('token_expires_at', expiryThreshold)
      .limit(500);

    if (connError) {
      console.error('[Cron Token Refresh] Failed to fetch connections:', connError);
      return NextResponse.json(
        { error: 'Failed to fetch ledger connections' },
        { status: 500 }
      );
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({
        refreshed: 0,
        failed: 0,
        errors: [],
        message: 'No tokens expiring soon',
      });
    }

    let refreshedCount = 0;
    let failedCount = 0;
    const errors: Array<{ connectionId: string; provider: string; error: string }> = [];
    const results: TokenRefreshResult[] = [];

    // ── Refresh connections in concurrent batches ────────────────────────
    const CONCURRENCY_LIMIT = 5;
    const typedConnections = connections as LedgerConnectionRow[];

    for (let i = 0; i < typedConnections.length; i += CONCURRENCY_LIMIT) {
      const batch = typedConnections.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.allSettled(
        batch.map(async (connection) => {
          const tokenResult = await refreshConnectionToken(connection);

          // Update the connection with new tokens and reset failure counter
          await db
            .from('ledger_connections')
            .update({
              access_token: encryptToken(tokenResult.accessToken),
              refresh_token: encryptToken(tokenResult.refreshToken),
              token_expires_at: computeTokenExpiresAt(tokenResult.expiresIn),
              refresh_failures: 0,
            })
            .eq('id', connection.id);

          console.info(
            `[Cron Token Refresh] Refreshed ${connection.provider} token for connection ${connection.id}`
          );

          return { connectionId: connection.id, provider: connection.provider };
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const connection = batch[j];
        if (result.status === 'fulfilled') {
          refreshedCount++;
          results.push({
            connectionId: connection.id,
            provider: connection.provider,
            success: true,
          });
        } else {
          failedCount++;
          const errorMessage =
            result.reason instanceof Error ? result.reason.message : 'Unknown error';
          errors.push({
            connectionId: connection.id,
            provider: connection.provider,
            error: errorMessage,
          });
          results.push({
            connectionId: connection.id,
            provider: connection.provider,
            success: false,
            error: errorMessage,
          });

          // F23: Increment failure counter; only deactivate after 3+ consecutive failures
          const currentFailures = connection.refresh_failures || 0;
          const newFailures = currentFailures + 1;
          const updatePayload: Record<string, unknown> = { refresh_failures: newFailures };
          if (newFailures >= 3) {
            updatePayload.is_active = false;
            console.error(
              `[Cron Token Refresh] Deactivating connection ${connection.id} after ${newFailures} consecutive failures`,
            );
          }
          await db
            .from('ledger_connections')
            .update(updatePayload)
            .eq('id', connection.id);

          console.error(
            `[Cron Token Refresh] Failed to refresh ${connection.provider} token for connection ${connection.id}:`,
            result.reason
          );
        }
      }
    }

    // ── Audit log the cron run ─────────────────────────────────────────
    await writeAuditLog({
      supabase: db,
      entityId: undefined,
      actorId: 'system',
      actorType: 'system',
      action: 'sync',
      targetType: 'token_refresh_cron',
      details: {
        refreshed: refreshedCount,
        failed: failedCount,
        total: connections.length,
        results,
      },
      request,
    });

    return NextResponse.json({
      refreshed: refreshedCount,
      failed: failedCount,
      total: connections.length,
      errors,
    });
  } catch (error) {
    return handleApiError(error, 'cron/token-refresh', 'Token refresh cron failed');
  }
}

export const GET = withSentryHandler(handler, { routeName: 'cron/token-refresh' });
