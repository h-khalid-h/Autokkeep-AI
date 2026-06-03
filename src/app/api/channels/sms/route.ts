import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { writeAuditLog } from '@/lib/audit';
import {
  parseTwilioWebhook,
  parseUserResponse,
  extractTransactionRef as _extractTransactionRef,
  validateTwilioSignature,
} from '@/lib/channels/twilio';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/channels/sms — Handle inbound SMS messages
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 100, windowSeconds: 60, prefix: 'channel-sms' });
    if (limited) return limited;

    const rawBody = await request.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody));

    // Validate Twilio signature
    if (!process.env.TWILIO_AUTH_TOKEN) {
      console.error('TWILIO_AUTH_TOKEN is not configured');
      return new NextResponse('Server configuration error', { status: 500 });
    }

    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/sms`;

    if (!validateTwilioSignature(url, params, signature)) {
      return new NextResponse('Invalid signature', { status: 401 });
    }

    const message = parseTwilioWebhook(params);
    const userResponse = parseUserResponse(message);

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // ── Handle opt-out keywords ─────────────────────────────────────────
    const bodyLower = message.body.toLowerCase().trim();
    if (['stop', 'unsubscribe', 'opt out', 'optout', 'quit'].includes(bodyLower)) {
      // Find the entity associated with this phone number from prior requests
      const { data: lastRequest } = await db
        .from('receipt_requests')
        .select('transaction_id')
        .eq('channel_type', 'sms')
        .eq('channel_user_id', message.from)
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

      // Upsert opt-out record
      await db.from('chase_opt_outs').upsert(
        {
          phone_number: message.from,
          entity_id: entityId,
          opted_out: true,
          opted_out_at: new Date().toISOString(),
          channel_type: 'sms',
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
        .eq('phone_number', message.from)
        .eq('channel_type', 'sms');

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Welcome back! You'll receive receipt reminders from Autokkeep again.</Message>
</Response>`;
      return new NextResponse(twiml, {
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    // Find pending receipt request from this phone number
    const { data: receiptRequest } = await db
      .from('receipt_requests')
      .select('id, transaction_id')
      .eq('channel_type', 'sms')
      .eq('channel_user_id', message.from)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    if (!receiptRequest) {
      // No pending request — send help text
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Hi! This is Autokkeep. We don't have a pending receipt request for your number. If you need help, visit ${process.env.NEXT_PUBLIC_APP_URL}</Message>
</Response>`;
      return new NextResponse(twiml, {
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    // Process the response
    switch (userResponse.type) {
      case 'business': {
        // Accept AI category
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
          .eq('id', receiptRequest.transaction_id);

        await db
          .from('receipt_requests')
          .update({ status: 'responded', responded_at: new Date().toISOString() })
          .eq('id', receiptRequest.id);

        if (tx) {
          await writeAuditLog({
            supabase: db,
            entityId: tx.entity_id,
            actorId: message.from,
            action: 'approve',
            targetType: 'transaction',
            targetId: receiptRequest.transaction_id,
            actorType: 'human',
            details: { source: 'sms', action: 'business', from: message.from },
            request,
          });
        }

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>✅ Got it! Transaction marked as business expense and categorized. No further action needed.</Message>
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
          .eq('id', receiptRequest.transaction_id);

        await db
          .from('receipt_requests')
          .update({ status: 'responded', responded_at: new Date().toISOString() })
          .eq('id', receiptRequest.id);

        if (tx) {
          await writeAuditLog({
            supabase: db,
            entityId: tx.entity_id,
            actorId: message.from,
            action: 'categorize',
            targetType: 'transaction',
            targetId: receiptRequest.transaction_id,
            actorType: 'human',
            details: { source: 'sms', action: 'personal', from: message.from },
            request,
          });
        }

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>❌ Noted! Transaction marked as personal and excluded from business books.</Message>
</Response>`;
        return new NextResponse(twiml, {
          headers: { 'Content-Type': 'application/xml' },
        });
      }

      case 'receipt': {
        if (userResponse.mediaUrls.length > 0) {
          // Receipt image uploaded — mark this request as responded
          await db
            .from('receipt_requests')
            .update({
              status: 'responded',
              receipt_url: userResponse.mediaUrls[0],
              responded_at: new Date().toISOString(),
            })
            .eq('id', receiptRequest.id);

          // Also close out any other pending chase requests for this transaction
          await db
            .from('receipt_requests')
            .update({
              status: 'responded',
              responded_at: new Date().toISOString(),
            })
            .eq('transaction_id', receiptRequest.transaction_id)
            .eq('status', 'sent')
            .neq('id', receiptRequest.id);

          await db
            .from('transactions')
            .update({
              document_status: 'found',
              document_url: userResponse.mediaUrls[0],
              updated_at: new Date().toISOString(),
            })
            .eq('id', receiptRequest.transaction_id);

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
              actorId: message.from,
              action: 'receipt_upload',
              targetType: 'transaction',
              targetId: receiptRequest.transaction_id,
              actorType: 'human',
              details: { source: 'sms', mediaUrl: userResponse.mediaUrls[0], from: message.from },
              request,
            });
          }

          const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>📎 Receipt received! We'll match it to the transaction and process it.</Message>
</Response>`;
          return new NextResponse(twiml, {
            headers: { 'Content-Type': 'application/xml' },
          });
        } else {
          const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>📸 Please send a photo of the receipt and we'll attach it to the transaction.</Message>
</Response>`;
          return new NextResponse(twiml, {
            headers: { 'Content-Type': 'application/xml' },
          });
        }
      }

      default: {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>I didn't understand that. Please reply:
1️⃣ "business" — business expense
2️⃣ "personal" — personal, exclude it  
3️⃣ Send a photo of the receipt</Message>
</Response>`;
        return new NextResponse(twiml, {
          headers: { 'Content-Type': 'application/xml' },
        });
      }
    }
  } catch (error: unknown) {
    console.error('SMS handler error:', error);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, something went wrong. Please try again or visit our dashboard.</Message>
</Response>`;
    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
