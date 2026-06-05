import { NextRequest, NextResponse } from 'next/server';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';
import { captureException } from '@/lib/sentry';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { writeAuditLog } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  verifySlackSignature,
  parseSlackInteraction,
  sendSlackConfirmation,
} from '@/lib/channels/slack';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Validate that a transaction belongs to an entity connected to this Slack workspace.
 * Defense-in-depth: even though Slack signatures are verified, we ensure the transaction
 * is owned by an entity that has an active Slack channel_connection matching the
 * workspace team_id from the payload.
 */
async function validateTransactionEntity(
  db: SupabaseQueryClient,
  transactionId: string,
  slackTeamId?: string
): Promise<{ entityId: string } | null> {
  // Step 1: Get the transaction's entity_id
  const { data: tx } = await db
    .from('transactions')
    .select('entity_id')
    .eq('id', transactionId)
    .single();

  if (!tx?.entity_id) return null;

  // Step 2: If we have a Slack team_id, verify entity has a matching channel_connection
  if (slackTeamId) {
    const { data: conn } = await db
      .from('channel_connections')
      .select('id')
      .eq('entity_id', tx.entity_id)
      .eq('channel_type', 'slack')
      .eq('channel_id', slackTeamId)
      .limit(1);

    if (!conn || conn.length === 0) {
      console.warn(
        `[Slack Interact] Transaction ${transactionId} entity ${tx.entity_id} has no Slack connection`
      );
      return null;
    }
  }

  return { entityId: tx.entity_id };
}

// POST /api/channels/slack/interact — Handle Slack interactive messages
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'slack-interact' });
    if (limited) return limited;

    const rawBody = await request.text();

    // Verify Slack signature
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      console.error('SLACK_SIGNING_SECRET is not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const timestamp = request.headers.get('x-slack-request-timestamp') || '';
    const signature = request.headers.get('x-slack-signature') || '';

    if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse URL-encoded payload
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');

    if (!payloadStr) {
      return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
    }

    const payload = JSON.parse(payloadStr);

    // Handle block actions
    if (payload.type === 'block_actions') {
      const action = payload.actions?.[0];
      if (!action) return NextResponse.json({ ok: true });

      const parsed = parseSlackInteraction(action.value);
      if (!parsed) return NextResponse.json({ ok: true });

      // Use admin client — no user session in Slack webhook context
      const supabase = createAdminClient();
      const db = supabase as unknown as SupabaseQueryClient;

      // Defense-in-depth: validate the transaction belongs to an entity with a Slack connection
      const validation = await validateTransactionEntity(
        db,
        parsed.transactionId,
        payload.team?.id
      );

      if (!validation) {
        console.warn(
          `[Slack Interact] Entity validation failed for transaction ${parsed.transactionId}`
        );
        return NextResponse.json({ error: 'Transaction not found or not linked to this workspace' }, { status: 403 });
      }

      const { entityId } = validation;

      switch (parsed.action) {
        case 'accept': {
          // Auto-approve the transaction with AI suggestion
          const { error } = await db
            .from('transactions')
            .update({
              status: TRANSACTION_STATUS.APPROVED,
              category_human: parsed.glCode,
              updated_at: new Date().toISOString(),
            })
            .eq('id', parsed.transactionId)
            .eq('entity_id', entityId); // Entity-scoped update

          if (!error) {
            await writeAuditLog({
              supabase: db,
              entityId,
              actorId: payload.user?.id || 'slack_user',
              actorType: 'human',
              action: 'approve',
              targetType: 'transaction',
              targetId: parsed.transactionId,
              details: {
                source: 'slack',
                action: 'accept',
                gl_code: parsed.glCode,
                user: payload.user?.name,
              },
              request,
            });

            await sendSlackConfirmation(
              payload.channel?.id,
              payload.message?.ts,
              parsed.transactionId,
              'accept',
              parsed.glCode,
              parsed.glName
            );
          }
          break;
        }

        case 'categorize': {
          const { error } = await db
            .from('transactions')
            .update({
              status: TRANSACTION_STATUS.APPROVED,
              category_human: parsed.glCode,
              updated_at: new Date().toISOString(),
            })
            .eq('id', parsed.transactionId)
            .eq('entity_id', entityId); // Entity-scoped update

          if (!error) {
            await writeAuditLog({
              supabase: db,
              entityId,
              actorId: payload.user?.id || 'slack_user',
              actorType: 'human',
              action: 'categorize',
              targetType: 'transaction',
              targetId: parsed.transactionId,
              details: {
                source: 'slack',
                action: 'categorize',
                gl_code: parsed.glCode,
                gl_name: parsed.glName,
              },
              request,
            });

            await sendSlackConfirmation(
              payload.channel?.id,
              payload.message?.ts,
              parsed.transactionId,
              'categorize',
              parsed.glCode,
              parsed.glName
            );
          }
          break;
        }

        case 'personal': {
          await db
            .from('transactions')
            .update({
              status: TRANSACTION_STATUS.APPROVED,
              tags: ['personal', 'excluded'],
              updated_at: new Date().toISOString(),
            })
            .eq('id', parsed.transactionId)
            .eq('entity_id', entityId); // Entity-scoped update

          // Audit log for personal classification (C2 fix — was missing)
          await writeAuditLog({
            supabase: db,
            entityId,
            actorId: payload.user?.id || 'slack_user',
            actorType: 'human',
            action: 'classify_personal',
            targetType: 'transaction',
            targetId: parsed.transactionId,
            details: {
              source: 'slack',
              action: 'personal',
              user: payload.user?.name,
            },
            request,
          });

          await sendSlackConfirmation(
            payload.channel?.id,
            payload.message?.ts,
            parsed.transactionId,
            'personal'
          );
          break;
        }

        case 'upload': {
          // Update receipt request status
          await db
            .from('receipt_requests')
            .update({ status: 'responded', responded_at: new Date().toISOString() })
            .eq('transaction_id', parsed.transactionId)
            .eq('channel_type', 'slack');

          // Audit log for receipt upload response (C2 fix — was missing)
          await writeAuditLog({
            supabase: db,
            entityId,
            actorId: payload.user?.id || 'slack_user',
            actorType: 'human',
            action: 'receipt_response',
            targetType: 'receipt_request',
            targetId: parsed.transactionId,
            details: {
              source: 'slack',
              action: 'upload',
              user: payload.user?.name,
            },
            request,
          });

          await sendSlackConfirmation(
            payload.channel?.id,
            payload.message?.ts,
            parsed.transactionId,
            'upload'
          );
          break;
        }
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('Slack interaction error:', error);
    captureException(error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
