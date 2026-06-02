
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/receipt-chase — Automated Receipt Chase (Cron, Weekdays 10 AM)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { captureException } from '@/lib/sentry';
import { createAdminClient } from '@/lib/supabase/admin';
import { runReceiptChase, type ChaseReport } from '@/lib/channels/chase-agent';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    // ── Verify cron secret ──────────────────────────────────────────────
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // ── Get all entities with active bank connections ────────────────────
    const { data: connections, error: connError } = await db
      .from('bank_connections')
      .select('entity_id')
      .eq('status', 'active');

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

    for (const entityId of entityIds) {
      try {
        const report = await runReceiptChase(entityId, db);
        reports.push(report);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        entityErrors.push({ entityId, error: errorMessage });
        console.error(`[Cron Receipt Chase] Failed for entity ${entityId}:`, err);
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
      ok: true,
      entities: entityIds.length,
      totalChased,
      totalSkipped,
      totalErrors,
      byChannel: aggregatedChannels,
      entityErrors: entityErrors.length > 0 ? entityErrors : undefined,
    });
  } catch (error) {
    captureException(error, { tags: { route: 'cron/receipt-chase' } });
    console.error('[Cron Receipt Chase] Error:', error);
    return NextResponse.json(
      { error: 'Receipt chase cron failed' },
      { status: 500 }
    );
  }
}
