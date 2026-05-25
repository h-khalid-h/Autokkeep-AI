import { NextRequest, NextResponse } from 'next/server';
import {
  parseTwilioWebhook,
  parseUserResponse,
  extractTransactionRef,
  validateTwilioSignature,
} from '@/lib/channels/twilio';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/channels/sms — Handle inbound SMS messages
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody));

    // Validate Twilio signature
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/sms`;

    if (process.env.TWILIO_AUTH_TOKEN && !validateTwilioSignature(url, params, signature)) {
      return new NextResponse('Invalid signature', { status: 401 });
    }

    const message = parseTwilioWebhook(params);
    const userResponse = parseUserResponse(message);

    const supabase = createAdminClient();

    // Find pending receipt request from this phone number
    const { data: receiptRequest } = await (supabase as any)
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
            details: { source: 'sms', action: 'business', from: message.from },
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
            details: { source: 'sms', action: 'personal', from: message.from },
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
          // Receipt image uploaded
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
  } catch (error) {
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
