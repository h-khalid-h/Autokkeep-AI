import { NextRequest, NextResponse } from 'next/server';
import {
  parseTwilioWebhook,
  parseUserResponse,
  validateTwilioSignature,
} from '@/lib/channels/twilio';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/channels/whatsapp — Handle inbound WhatsApp messages
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody));

    // Validate Twilio signature
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/whatsapp`;

    if (process.env.TWILIO_AUTH_TOKEN && !validateTwilioSignature(url, params, signature)) {
      return new NextResponse('Invalid signature', { status: 401 });
    }

    const message = parseTwilioWebhook(params);

    // Only process WhatsApp messages
    if (!message.isWhatsApp) {
      return new NextResponse('Not a WhatsApp message', { status: 400 });
    }

    const userResponse = parseUserResponse(message);

    const supabase = createAdminClient();

    // Strip whatsapp: prefix for lookup
    const phoneNumber = message.from.replace('whatsapp:', '');

    // Find pending receipt request
    const { data: receiptRequest } = await (supabase as any)
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
        const { data: tx } = await (supabase as any)
          .from('transactions')
          .select('entity_id, category_ai')
          .eq('id', receiptRequest.transaction_id)
          .single();

        await (supabase as any)
          .from('transactions')
          .update({
            status: 'approved',
            category_human: tx?.category_ai,
            updated_at: new Date().toISOString(),
          })
          .eq('id', receiptRequest.transaction_id);

        await (supabase as any)
          .from('receipt_requests')
          .update({ status: 'responded', responded_at: new Date().toISOString() })
          .eq('id', receiptRequest.id);

        if (tx) {
          await (supabase as any).from('audit_log').insert({
            entity_id: tx.entity_id,
            action: 'approve',
            target_type: 'transaction',
            target_id: receiptRequest.transaction_id,
            actor_type: 'human',
            details: { source: 'whatsapp', action: 'business', from: phoneNumber },
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
        const { data: tx } = await (supabase as any)
          .from('transactions')
          .select('entity_id')
          .eq('id', receiptRequest.transaction_id)
          .single();

        await (supabase as any)
          .from('transactions')
          .update({
            status: 'approved',
            tags: ['personal', 'excluded'],
            updated_at: new Date().toISOString(),
          })
          .eq('id', receiptRequest.transaction_id);

        await (supabase as any)
          .from('receipt_requests')
          .update({ status: 'responded', responded_at: new Date().toISOString() })
          .eq('id', receiptRequest.id);

        if (tx) {
          await (supabase as any).from('audit_log').insert({
            entity_id: tx.entity_id,
            action: 'categorize',
            target_type: 'transaction',
            target_id: receiptRequest.transaction_id,
            actor_type: 'human',
            details: { source: 'whatsapp', action: 'personal', from: phoneNumber },
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
          await (supabase as any)
            .from('receipt_requests')
            .update({
              status: 'responded',
              receipt_url: userResponse.mediaUrls[0],
              responded_at: new Date().toISOString(),
            })
            .eq('id', receiptRequest.id);

          await (supabase as any)
            .from('transactions')
            .update({
              document_status: 'found',
              document_url: userResponse.mediaUrls[0],
              updated_at: new Date().toISOString(),
            })
            .eq('id', receiptRequest.transaction_id);

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
  } catch (error) {
    console.error('WhatsApp handler error:', error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Sorry, something went wrong. Please try again.</Message></Response>`,
      { headers: { 'Content-Type': 'application/xml' } }
    );
  }
}
