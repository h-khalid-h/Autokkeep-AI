
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/receipt-chase — Automated Receipt Chase (Cron, Weekdays 10 AM)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { withSentryHandler } from '@/lib/sentry';
import { handleApiError } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { runReceiptChase, type ChaseReport } from '@/lib/channels/chase-agent';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { verifyCronAuth } from '@/lib/cron-auth';

async function handler(request: NextRequest) {
  try {
    // ── Verify cron secret (timing-safe) ────────────────────────────────
    const cronError = verifyCronAuth(request);
    if (cronError) return cronError;

    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'cron-receipt-chase' });
    if (limited) return limited;

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // ── Get all entities with active bank connections ────────────────────
    const { data: connections, error: connError } = await db
      .from('bank_connections')
      .select('entity_id')
      .eq('status', 'active')
      .limit(500);

    if (connError) {
      console.error('[Cron Receipt Chase] Failed to fetch connections:', connError);
      return NextResponse.json(
        { error: 'Failed to fetch bank connections' },
        { status: 500 }
      );
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({
        chased: 0,
        entities: 0,
        message: 'No active bank connections found',
      });
    }

    // Deduplicate entity IDs (an entity may have multiple bank connections)
    const entityIds: string[] = [...new Set<string>(
      connections.map((c: Record<string, unknown>) => c.entity_id as string)
    )];

    // ── Run chase agent for each entity ─────────────────────────────────
    const reports: ChaseReport[] = [];
    const entityErrors: Array<{ entityId: string; error: string }> = [];

    const CONCURRENCY_LIMIT = 5;
    for (let i = 0; i < entityIds.length; i += CONCURRENCY_LIMIT) {
      const batch = entityIds.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.allSettled(
        batch.map(async (entityId) => runReceiptChase(entityId, db))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          reports.push(result.value);
        } else {
          const errorMessage = result.reason instanceof Error ? result.reason.message : 'Unknown error';
          entityErrors.push({ entityId: batch[j], error: errorMessage });
          console.error(`[Cron Receipt Chase] Failed for entity ${batch[j]}:`, result.reason);
        }
      }
    }

    // ── Aggregate results ───────────────────────────────────────────────
    const totalChased = reports.reduce((sum, r) => sum + r.totalChased, 0);
    const totalSkipped = reports.reduce((sum, r) => sum + r.skipped, 0);
    const totalErrors = reports.reduce((sum, r) => sum + r.errors.length, 0) + entityErrors.length;

    const aggregatedChannels: Record<string, number> = {};
    for (const report of reports) {
      for (const [channel, count] of Object.entries(report.byChannel)) {
        aggregatedChannels[channel] = (aggregatedChannels[channel] || 0) + count;
      }
    }

    // ── Audit log the cron run ──────────────────────────────────────────
    await writeAuditLog({
      supabase: db,
      entityId: undefined,
      actorId: 'system',
      actorType: 'system',
      action: 'sync',
      targetType: 'receipt_chase_cron',
      details: {
        entities_processed: entityIds.length,
        total_chased: totalChased,
        total_skipped: totalSkipped,
        total_errors: totalErrors,
        by_channel: aggregatedChannels,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      entities: entityIds.length,
      totalChased,
      totalSkipped,
      totalErrors,
      byChannel: aggregatedChannels,
      entityErrors: entityErrors.length > 0 ? entityErrors : undefined,
    });
  } catch (error) {
    return handleApiError(error, 'cron/receipt-chase', 'Receipt chase cron failed');
  }
}

export const GET = withSentryHandler(handler, { routeName: 'cron/receipt-chase' });
