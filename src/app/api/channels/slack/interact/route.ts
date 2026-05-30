import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { writeAuditLog } from '@/lib/audit';
import {
  verifySlackSignature,
  parseSlackInteraction,
  sendSlackConfirmation,
} from '@/lib/channels/slack';

// POST /api/channels/slack/interact — Handle Slack interactive messages
export async function POST(request: NextRequest) {
  try {
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

      const { createServerClient } = await import('@/lib/supabase/server');
      const supabase = await createServerClient();
      const db = supabase as unknown as SupabaseQueryClient;

      switch (parsed.action) {
        case 'accept': {
          // Auto-approve the transaction with AI suggestion
          const { error } = await db
            .from('transactions')
            .update({
              status: 'approved',
              category_human: parsed.glCode,
              updated_at: new Date().toISOString(),
            })
            .eq('id', parsed.transactionId);

          if (!error) {
            // Log to audit trail
            await writeAuditLog({
              supabase: db,
              entityId: (await db.from('transactions').select('entity_id').eq('id', parsed.transactionId).single()).data?.entity_id,
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
              status: 'approved',
              category_human: parsed.glCode,
              updated_at: new Date().toISOString(),
            })
            .eq('id', parsed.transactionId);

          if (!error) {
            await writeAuditLog({
              supabase: db,
              entityId: (await db.from('transactions').select('entity_id').eq('id', parsed.transactionId).single()).data?.entity_id,
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
              status: 'approved',
              tags: ['personal', 'excluded'],
              updated_at: new Date().toISOString(),
            })
            .eq('id', parsed.transactionId);

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
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
