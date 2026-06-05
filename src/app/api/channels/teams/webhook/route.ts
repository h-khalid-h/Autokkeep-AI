import { NextRequest, NextResponse } from 'next/server';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { parseTeamsWebhookPayload, mapTeamsChoiceToGL, sendTeamsConfirmation } from '@/lib/channels/teams';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';
import { timingSafeEqual } from 'crypto';

/**
 * Validate that a transaction belongs to an entity connected to this Teams workspace.
 * Defense-in-depth: even though the webhook secret is verified, we ensure the transaction
 * is owned by an entity that has an active Teams channel_connection.
 */
async function validateTransactionEntity(
  db: SupabaseQueryClient,
  transactionId: string
): Promise<{ entityId: string } | null> {
  const { data: tx } = await db
    .from('transactions')
    .select('entity_id')
    .eq('id', transactionId)
    .single();

  if (!tx?.entity_id) return null;

  // Verify entity has a Teams channel_connection
  const { data: conn } = await db
    .from('channel_connections')
    .select('id')
    .eq('entity_id', tx.entity_id)
    .eq('channel_type', 'teams')
    .limit(1);

  if (!conn || conn.length === 0) {
    console.warn(
      `[Teams Webhook] Transaction ${transactionId} entity ${tx.entity_id} has no Teams connection`
    );
    return null;
  }

  return { entityId: tx.entity_id };
}

// POST /api/channels/teams/webhook — Handle Teams adaptive card responses
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 100, windowSeconds: 60, prefix: 'channel-teams' });
    if (limited) return limited;

    // Verify shared secret
    const webhookSecret = process.env.TEAMS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('TEAMS_WEBHOOK_SECRET is not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const providedSecret = request.headers.get('x-teams-secret');
    if (!providedSecret) {
      return NextResponse.json({ error: 'Missing webhook secret' }, { status: 401 });
    }
    try {
      const isValid = timingSafeEqual(
        Buffer.from(providedSecret),
        Buffer.from(webhookSecret)
      );
      if (!isValid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const parsed = parseTeamsWebhookPayload(body);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Defense-in-depth: validate the transaction belongs to an entity with a Teams connection
    const validation = await validateTransactionEntity(db, parsed.transactionId);
    if (!validation) {
      console.warn(
        `[Teams Webhook] Entity validation failed for transaction ${parsed.transactionId}`
      );
      return NextResponse.json({ error: 'Transaction not found or not linked to this workspace' }, { status: 403 });
    }

    const { entityId } = validation;

    if (parsed.categoryChoice === 'personal') {
      // Mark as personal/excluded — entity-scoped
      await db
        .from('transactions')
        .update({
          status: TRANSACTION_STATUS.APPROVED,
          tags: ['personal', 'excluded'],
          updated_at: new Date().toISOString(),
        })
        .eq('id', parsed.transactionId)
        .eq('entity_id', entityId);

      // Send confirmation
      const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
      if (webhookUrl) {
        await sendTeamsConfirmation(webhookUrl, parsed.transactionId, 'personal');
      }
    } else if (parsed.categoryChoice === 'accept') {
      // Accept AI suggestion — entity-scoped
      const { data: tx } = await db
        .from('transactions')
        .select('category_ai')
        .eq('id', parsed.transactionId)
        .eq('entity_id', entityId)
        .single();

      await db
        .from('transactions')
        .update({
          status: TRANSACTION_STATUS.APPROVED,
          category_human: tx?.category_ai,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parsed.transactionId)
        .eq('entity_id', entityId);

      const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
      if (webhookUrl) {
        await sendTeamsConfirmation(
          webhookUrl,
          parsed.transactionId,
          'accept',
          tx?.category_ai
        );
      }
    } else {
      // Map choice to GL code — entity-scoped
      const gl = mapTeamsChoiceToGL(parsed.categoryChoice);
      if (gl) {
        await db
          .from('transactions')
          .update({
            status: TRANSACTION_STATUS.APPROVED,
            category_human: gl.glCode,
            updated_at: new Date().toISOString(),
          })
          .eq('id', parsed.transactionId)
          .eq('entity_id', entityId);

        const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
        if (webhookUrl) {
          await sendTeamsConfirmation(
            webhookUrl,
            parsed.transactionId,
            'categorize',
            gl.glCode,
            gl.glName
          );
        }
      }
    }

    // Log to audit trail
    await writeAuditLog({
      supabase: db,
      entityId,
      actorType: 'human',
      action: 'categorize',
      targetType: 'transaction',
      targetId: parsed.transactionId,
      details: {
        source: 'teams',
        choice: parsed.categoryChoice,
        action: parsed.action,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'channels/teams/webhook', 'Internal error');
  }
}
