import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { verifySlackSignature } from '@/lib/channels/slack';
import { writeAuditLog } from '@/lib/audit';

// POST /api/channels/slack/events — Handle Slack Events API
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 100, windowSeconds: 60, prefix: 'channel-slack-events' });
    if (limited) return limited;

    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

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

    // Handle URL verification challenge (after signature check)
    if (body.type === 'url_verification') {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Handle events
    if (body.type === 'event_callback') {
      const event = body.event;

      switch (event.type) {
        case 'message': {
          // Handle file uploads in threads (receipt uploads)
          if (event.files && event.files.length > 0 && event.thread_ts) {
            await handleFileUpload(event);
          }
          break;
        }

        case 'app_mention': {
          // Handle @autokkeep mentions
          break;
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('Slack events error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Handle file uploads in receipt request threads
async function handleFileUpload(event: Record<string, unknown>) {
  const files = event.files as Array<{ url_private: string; mimetype: string; name: string }>;
  const threadTs = event.thread_ts as string;

  if (!files?.length || !threadTs) return;

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const supabase = createAdminClient();
  const db = supabase as unknown as SupabaseQueryClient;

  // Find the receipt request linked to this thread
  const { data: receiptRequest } = await db
    .from('receipt_requests')
    .select('id, transaction_id')
    .eq('message_id', threadTs)
    .eq('channel_type', 'slack')
    .single();

  if (!receiptRequest) return;

  // Update receipt request with uploaded file URL
  await db
    .from('receipt_requests')
    .update({
      status: 'responded',
      receipt_url: files[0].url_private,
      responded_at: new Date().toISOString(),
    })
    .eq('id', receiptRequest.id);

  // Update transaction document status
  await db
    .from('transactions')
    .update({
      document_status: 'found',
      document_url: files[0].url_private,
      updated_at: new Date().toISOString(),
    })
    .eq('id', receiptRequest.transaction_id);

  // Log to audit trail
  const { data: tx } = await db
    .from('transactions')
    .select('entity_id')
    .eq('id', receiptRequest.transaction_id)
    .single();

  if (tx) {
    await writeAuditLog({
      supabase: db,
      entityId: tx.entity_id,
      actorId: (event.user as string) || 'slack_user',
      actorType: 'human',
      action: 'update',
      targetType: 'transaction',
      targetId: receiptRequest.transaction_id,
      details: {
        source: 'slack',
        action: 'receipt_upload',
        file_name: files[0].name,
        file_type: files[0].mimetype,
      },
    });
  }
}
