
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/token-refresh — OAuth Token Refresh (Cron)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { captureException } from '@/lib/sentry';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  refreshConnectionToken,
  computeTokenExpiresAt,
  type LedgerConnectionRow,
  type TokenRefreshResult,
} from '@/lib/ledger/token-refresh';
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

    // ── Fetch connections with tokens expiring within 24 hours ──────────
    const expiryThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: connections, error: connError } = await db
      .from('ledger_connections')
      .select('id, entity_id, provider, access_token, refresh_token, realm_id, tenant_id, is_active, token_expires_at')
      .eq('is_active', true)
      .not('refresh_token', 'is', null)
      .lt('token_expires_at', expiryThreshold);

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

    // ── Refresh each connection ────────────────────────────────────────
    for (const connection of connections as LedgerConnectionRow[]) {
      try {
        const tokenResult = await refreshConnectionToken(connection);

        // Update the connection with new tokens
        await db
          .from('ledger_connections')
          .update({
            access_token: tokenResult.accessToken,
            refresh_token: tokenResult.refreshToken,
            token_expires_at: computeTokenExpiresAt(tokenResult.expiresIn),
          })
          .eq('id', connection.id);

        refreshedCount++;
        results.push({
          connectionId: connection.id,
          provider: connection.provider,
          success: true,
        });

        console.info(
          `[Cron Token Refresh] Refreshed ${connection.provider} token for connection ${connection.id}`
        );
      } catch (err: unknown) {
        failedCount++;
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
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

        // Mark connection as inactive (token_expired)
        await db
          .from('ledger_connections')
          .update({
            is_active: false,
          })
          .eq('id', connection.id);

        console.error(
          `[Cron Token Refresh] Failed to refresh ${connection.provider} token for connection ${connection.id}:`,
          err
        );
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
    captureException(error, { tags: { route: 'cron/token-refresh' } });
    console.error('[Cron Token Refresh] Error:', error);
    return NextResponse.json(
      { error: 'Token refresh cron failed' },
      { status: 500 }
    );
  }
}
