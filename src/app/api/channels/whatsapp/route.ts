import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { rateLimit } from '@/lib/rate-limit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import {
  parseTwilioWebhook,
  parseUserResponse,
  validateTwilioSignature,
} from '@/lib/channels/twilio';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';

// POST /api/channels/whatsapp — Handle inbound WhatsApp messages
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 100, windowSeconds: 60, prefix: 'channel-whatsapp' });
    if (limited) return limited;

    const rawBody = await request.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody));

    // Validate Twilio signature
    if (!process.env.TWILIO_AUTH_TOKEN) {
      console.error('TWILIO_AUTH_TOKEN is not configured');
      return new NextResponse('Server configuration error', { status: 500 });
    }

    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/whatsapp`;

    if (!validateTwilioSignature(url, params, signature)) {
      return new NextResponse('Invalid signature', { status: 401 });
    }

    const message = parseTwilioWebhook(params);

    // Only process WhatsApp messages
    if (!message.isWhatsApp) {
      return new NextResponse('Not a WhatsApp message', { status: 400 });
    }

    const userResponse = parseUserResponse(message);

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Strip whatsapp: prefix for lookup
    const phoneNumber = message.from.replace('whatsapp:', '');

    // ── Handle opt-out keywords ─────────────────────────────────────────
    const bodyLower = message.body.toLowerCase().trim();
    if (['stop', 'unsubscribe', 'opt out', 'optout', 'quit'].includes(bodyLower)) {
      // Find the entity associated with this phone number
      const { data: lastRequest } = await db
        .from('receipt_requests')
        .select('transaction_id')
        .eq('channel_type', 'whatsapp')
        .eq('channel_user_id', phoneNumber)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      let entityId = 'unknown';
      if (lastRequest) {
        const { data: tx } = await db
          .from('transactions')
          .select('entity_id')
          .eq('id', lastRequest.transaction_id)
          .single();
        if (tx) entityId = tx.entity_id;
      }

      await db.from('chase_opt_outs').upsert(
        {
          phone_number: phoneNumber,
          entity_id: entityId,
          opted_out: true,
          opted_out_at: new Date().toISOString(),
          channel_type: 'whatsapp',
        },
        { onConflict: 'phone_number,entity_id' }
      );

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You've been unsubscribed from Autokkeep receipt reminders. Reply "start" to re-subscribe.</Message>
</Response>`;
      return new NextResponse(twiml, {
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    // ── Handle re-subscribe ─────────────────────────────────────────────
    if (['start', 'subscribe', 'opt in', 'optin', 'resume'].includes(bodyLower)) {
      await db
        .from('chase_opt_outs')
        .update({ opted_out: false, opted_out_at: null })
        .eq('phone_number', phoneNumber)
        .eq('channel_type', 'whatsapp');

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Welcome back! You'll receive receipt reminders from Autokkeep again.</Message>
</Response>`;
      return new NextResponse(twiml, {
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    // Find pending receipt request
    const { data: receiptRequest } = await db
      .from('receipt_requests')
      .select('id, transaction_id')
      .eq('channel_type', 'whatsapp')
      .eq('channel_user_id', phoneNumber)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    if (!receiptRequest) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>👋 Hi! This is Autokkeep. We don't have a pending receipt request for your number. Visit ${process.env.NEXT_PUBLIC_APP_URL} for help.</Message>
</Response>`;
      return new NextResponse(twiml, {
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    // Process response (same logic as SMS but via WhatsApp)
    switch (userResponse.type) {
      case 'business': {
        const { data: tx } = await db
          .from('transactions')
          .select('entity_id, category_ai')
          .eq('id', receiptRequest.transaction_id)
          .single();

        await db
          .from('transactions')
          .update({
            status: 'approved',
            category_human: tx?.category_ai || 'uncategorized',
            updated_at: new Date().toISOString(),
          })
          .eq('id', receiptRequest.transaction_id)
          .eq('entity_id', tx?.entity_id ?? '');

        await db
          .from('receipt_requests')
          .update({ status: 'responded', responded_at: new Date().toISOString() })
          .eq('id', receiptRequest.id);

        if (tx) {
          await writeAuditLog({
            supabase: db,
            entityId: tx.entity_id,
            actorId: phoneNumber,
            actorType: 'human',
            action: 'approve',
            targetType: 'transaction',
            targetId: receiptRequest.transaction_id,
            details: { source: 'whatsapp', action: 'business', from: phoneNumber },
            request,
          });
        }

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>✅ Transaction marked as business expense! Categorized and syncing to your ledger.</Message>
</Response>`;
        return new NextResponse(twiml, {
          headers: { 'Content-Type': 'application/xml' },
        });
      }

      case 'personal': {
        const { data: tx } = await db
          .from('transactions')
          .select('entity_id')
          .eq('id', receiptRequest.transaction_id)
          .single();

        await db
          .from('transactions')
          .update({
            status: 'approved',
            tags: ['personal', 'excluded'],
            updated_at: new Date().toISOString(),
          })
          .eq('id', receiptRequest.transaction_id)
          .eq('entity_id', tx?.entity_id ?? '');

        await db
          .from('receipt_requests')
          .update({ status: 'responded', responded_at: new Date().toISOString() })
          .eq('id', receiptRequest.id);

        if (tx) {
          await writeAuditLog({
            supabase: db,
            entityId: tx.entity_id,
            actorId: phoneNumber,
            actorType: 'human',
            action: 'categorize',
            targetType: 'transaction',
            targetId: receiptRequest.transaction_id,
            details: { source: 'whatsapp', action: 'personal', from: phoneNumber },
            request,
          });
        }

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>❌ Got it — marked as personal and excluded from business books.</Message>
</Response>`;
        return new NextResponse(twiml, {
          headers: { 'Content-Type': 'application/xml' },
        });
      }

      case 'receipt': {
        if (userResponse.mediaUrls.length > 0) {
          // Mark this request as responded
          await db
            .from('receipt_requests')
            .update({
              status: 'responded',
              receipt_url: userResponse.mediaUrls[0],
              responded_at: new Date().toISOString(),
            })
            .eq('id', receiptRequest.id);

          // Close out any other pending chase requests for this transaction
          await db
            .from('receipt_requests')
            .update({
              status: 'responded',
              responded_at: new Date().toISOString(),
            })
            .eq('transaction_id', receiptRequest.transaction_id)
            .eq('status', 'sent')
            .neq('id', receiptRequest.id);

          // Look up entity_id first for scoped update
          const { data: receiptTxLookup } = await db
            .from('transactions')
            .select('entity_id')
            .eq('id', receiptRequest.transaction_id)
            .single();

          await db
            .from('transactions')
            .update({
              document_status: 'found',
              document_url: userResponse.mediaUrls[0],
              updated_at: new Date().toISOString(),
            })
            .eq('id', receiptRequest.transaction_id)
            .eq('entity_id', receiptTxLookup?.entity_id ?? '');

          // Audit log for receipt upload
          const { data: receiptTx } = await db
            .from('transactions')
            .select('entity_id')
            .eq('id', receiptRequest.transaction_id)
            .single();

          if (receiptTx) {
            await writeAuditLog({
              supabase: db,
              entityId: receiptTx.entity_id,
              actorId: phoneNumber,
              actorType: 'human',
              action: 'receipt_upload',
              targetType: 'transaction',
              targetId: receiptRequest.transaction_id,
              details: { source: 'whatsapp', mediaUrl: userResponse.mediaUrls[0], from: phoneNumber },
              request,
            });
          }

          const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>📎 Receipt received via WhatsApp! Matched to your transaction and processing.</Message>
</Response>`;
          return new NextResponse(twiml, {
            headers: { 'Content-Type': 'application/xml' },
          });
        }

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>📸 Please send a photo of the receipt. You can also forward the email receipt image!</Message>
</Response>`;
        return new NextResponse(twiml, {
          headers: { 'Content-Type': 'application/xml' },
        });
      }

      default: {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>I didn't understand that. Please reply:

1️⃣ "business" — business expense
2️⃣ "personal" — exclude from books
3️⃣ Send a photo of the receipt</Message>
</Response>`;
        return new NextResponse(twiml, {
          headers: { 'Content-Type': 'application/xml' },
        });
      }
    }
  } catch (error: unknown) {
    console.error('WhatsApp handler error:', error);
    captureException(error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Sorry, something went wrong. Please try again.</Message></Response>`,
      { headers: { 'Content-Type': 'application/xml' } }
    );
  }
}
