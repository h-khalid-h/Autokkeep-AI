
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/cron/close-reminder — Period Close Readiness Notifications
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Checks entities with unlocked periods and sends readiness reminders
// to entity admins when the close readiness score is below 80%.

import { NextRequest, NextResponse } from 'next/server';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { withSentryHandler } from '@/lib/sentry';
import { handleApiError } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchWithFallback, type ChannelConnection } from '@/lib/channels/dispatcher';
import {
  buildCloseReminderSlackBlocks,
  buildCloseReminderSMS,
  buildCloseReminderEmailHtml,
} from '@/lib/notifications/close-reminder';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EntityRecord {
  id: string;
  name: string;
  org_id: string;
  current_period: string | null;
  period_locked: boolean;
}

interface ReadinessResult {
  entityId: string;
  entityName: string;
  score: number;
  failedChecks: string[];
  notified: boolean;
  error?: string;
}

// ─── Readiness Calculator ──────────────────────────────────────────────────────

async function calculateReadiness(
  db: SupabaseQueryClient,
  entityId: string,
  period: string
): Promise<{ score: number; failedChecks: string[] }> {
  const failedChecks: string[] = [];

  // Calculate the period date range
  const periodDate = new Date(period + '-01');
  const periodStart = periodDate.toISOString().split('T')[0];
  const nextMonth = new Date(periodDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const periodEnd = nextMonth.toISOString().split('T')[0];

  // Query transaction counts for this period
  const { data: transactions } = await db
    .from('transactions')
    .select('id, status, document_status, gl_code')
    .eq('entity_id', entityId)
    .gte('date', periodStart)
    .lt('date', periodEnd)
    .limit(10000);

  const txns = (transactions || []) as Array<{
    id: string;
    status: string;
    document_status: string | null;
    gl_code: string | null;
  }>;

  const totalCount = txns.length;
  if (totalCount === 0) {
    return { score: 100, failedChecks: [] };
  }

  // Check 1: Uncategorized transactions (no GL code)
  const uncategorized = txns.filter((t) => !t.gl_code).length;
  if (uncategorized > 0) {
    failedChecks.push(`${uncategorized} transaction${uncategorized > 1 ? 's' : ''} uncategorized`);
  }

  // Check 2: Missing receipts
  const missingReceipts = txns.filter(
    (t) => t.document_status === 'missing' || t.document_status === null
  ).length;
  if (missingReceipts > 0) {
    failedChecks.push(`${missingReceipts} receipt${missingReceipts > 1 ? 's' : ''} missing`);
  }

  // Check 3: Pending review transactions
  const pendingReview = txns.filter(
    (t) => t.status === TRANSACTION_STATUS.ESCROW_SUSPENSE || t.status === TRANSACTION_STATUS.HUMAN_REVIEW
  ).length;
  if (pendingReview > 0) {
    failedChecks.push(`${pendingReview} transaction${pendingReview > 1 ? 's' : ''} pending review`);
  }

  // Score = percentage of clean transactions
  const issueCount = uncategorized + missingReceipts + pendingReview;
  const score = Math.round(((totalCount - issueCount) / totalCount) * 100);

  return {
    score: Math.max(0, Math.min(100, score)),
    failedChecks,
  };
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

async function handler(request: NextRequest) {
  try {
    // ── Verify cron secret ──────────────────────────────────────────────
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'cron-close-reminder' });
    if (limited) return limited;

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // ── Query entities with unlocked current periods ────────────────────
    const { data: entities, error: entityError } = await db
      .from('entities')
      .select('id, name, org_id, current_period, period_locked')
      .eq('period_locked', false)
      .limit(500);

    if (entityError) {
      console.error('[Cron Close Reminder] Failed to fetch entities:', entityError);
      return NextResponse.json(
        { error: 'Failed to fetch entities' },
        { status: 500 }
      );
    }

    if (!entities || entities.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        notified: 0,
        message: 'No entities with unlocked periods',
      });
    }

    // ── Process each entity ─────────────────────────────────────────────
    const results: ReadinessResult[] = [];

    for (const entity of entities as EntityRecord[]) {
      if (!entity.current_period) continue;

      try {
        const { score, failedChecks } = await calculateReadiness(
          db,
          entity.id,
          entity.current_period
        );

        if (score >= 80) {
          results.push({
            entityId: entity.id,
            entityName: entity.name,
            score,
            failedChecks,
            notified: false,
          });
          continue;
        }

        // ── Score < 80: notify entity admins ──────────────────────────
        // Fetch admin users for this entity's org
        const { data: members } = await db
          .from('team_members')
          .select('user_id, role')
          .eq('org_id', entity.org_id)
          .in('role', ['owner', 'admin']);

        if (!members || members.length === 0) {
          results.push({
            entityId: entity.id,
            entityName: entity.name,
            score,
            failedChecks,
            notified: false,
            error: 'No admin users found',
          });
          continue;
        }

        // Batch-fetch all channel connections for this entity upfront (eliminates N+1)
        const memberUserIds = (members as Array<{ user_id: string; role: string }>).map((m) => m.user_id);
        const { data: allConnections } = await db
          .from('channel_connections')
          .select('user_id, channel_type, channel_id, access_token, webhook_url')
          .eq('entity_id', entity.id)
          .in('user_id', memberUserIds);

        // Build a lookup map: user_id → channel connections
        const connectionsByUser = new Map<string, Array<{
          channel_type: string;
          channel_id: string;
          access_token: string | null;
          webhook_url: string | null;
        }>>();
        for (const conn of (allConnections || []) as Array<{
          user_id: string;
          channel_type: string;
          channel_id: string;
          access_token: string | null;
          webhook_url: string | null;
        }>) {
          if (!connectionsByUser.has(conn.user_id)) {
            connectionsByUser.set(conn.user_id, []);
          }
          connectionsByUser.get(conn.user_id)!.push(conn);
        }

        // Fetch channel connections for each admin from pre-fetched map
        let notified = false;
        for (const member of members as Array<{ user_id: string; role: string }>) {
          const connections = connectionsByUser.get(member.user_id);

          if (!connections || connections.length === 0) continue;

          const channelConns: ChannelConnection[] = (
            connections as Array<{
              channel_type: string;
              channel_id: string;
              access_token: string | null;
              webhook_url: string | null;
            }>
          ).map((c) => ({
            channelType: c.channel_type as ChannelConnection['channelType'],
            channelId: c.channel_id,
            accessToken: c.access_token || undefined,
            webhookUrl: c.webhook_url || undefined,
          }));

          // Build the period label (e.g., "May 2026")
          const periodDate = new Date(entity.current_period + '-01');
          const periodLabel = periodDate.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          });

          // Use Slack blocks if available, otherwise SMS
          const slackBlocks = buildCloseReminderSlackBlocks(
            entity.name,
            periodLabel,
            score,
            failedChecks
          );
          const smsText = buildCloseReminderSMS(entity.name, periodLabel, score);
          const emailHtml = buildCloseReminderEmailHtml(
            entity.name,
            periodLabel,
            score,
            failedChecks
          );

          // Dispatch via the fallback chain with rich content
          const result = await dispatchWithFallback(channelConns, {
            transactionId: `close-reminder-${entity.id}`,
            merchantName: `Period Close: ${periodLabel}`,
            amount: score,
            date: new Date().toISOString().split('T')[0],
            cardLast4: '0000',
            cardHolder: 'System',
            suggestedCategory: `Readiness: ${score}%`,
            confidence: score,
            // Rich message overrides
            slackBlocks,
            smsText,
            emailHtml,
          });

          if (result.success) notified = true;
        }

        results.push({
          entityId: entity.id,
          entityName: entity.name,
          score,
          failedChecks,
          notified,
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Cron Close Reminder] Failed for entity ${entity.id}:`, err);
        results.push({
          entityId: entity.id,
          entityName: entity.name,
          score: 0,
          failedChecks: [],
          notified: false,
          error: errorMessage,
        });
      }
    }

    // ── Aggregate results ───────────────────────────────────────────────
    const processed = results.length;
    const notifiedCount = results.filter((r) => r.notified).length;
    const belowThreshold = results.filter((r) => r.score < 80).length;

    // ── Audit log ───────────────────────────────────────────────────────
    await writeAuditLog({
      supabase: db,
      entityId: undefined,
      actorId: 'system',
      actorType: 'system',
      action: 'sync',
      targetType: 'close_reminder_cron',
      details: {
        entities_processed: processed,
        entities_notified: notifiedCount,
        entities_below_threshold: belowThreshold,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      processed,
      notified: notifiedCount,
      belowThreshold,
      results,
    });
  } catch (error) {
    return handleApiError(error, 'cron/close-reminder', 'Close reminder cron failed');
  }
}

export const POST = withSentryHandler(handler, { routeName: 'cron/close-reminder' });
