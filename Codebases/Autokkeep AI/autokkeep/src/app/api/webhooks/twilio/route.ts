import { NextRequest, NextResponse } from 'next/server';
import { parseTwilioWebhook, validateTwilioSignature } from '@/lib/channels/twilio';

// POST /api/webhooks/twilio — Handle Twilio status callbacks
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody));

    // Validate signature
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`;

    if (process.env.TWILIO_AUTH_TOKEN && !validateTwilioSignature(url, params, signature)) {
      return new NextResponse('Invalid signature', { status: 401 });
    }

    const messageStatus = params.MessageStatus;
    const messageSid = params.MessageSid;

    // Log delivery status
    if (messageStatus && messageSid) {
      const { createServerClient } = await import('@/lib/supabase/server');
      const supabase = await createServerClient();

      // Update receipt request delivery status if applicable
      if (messageStatus === 'delivered' || messageStatus === 'read') {
        await (supabase as any)
          .from('receipt_requests')
          .update({ status: 'sent' })
          .eq('message_id', messageSid);
      }

      if (messageStatus === 'failed' || messageStatus === 'undelivered') {
        console.error(`Twilio message ${messageSid} failed: ${params.ErrorCode} - ${params.ErrorMessage}`);
        await (supabase as any)
          .from('receipt_requests')
          .update({ status: 'expired' })
          .eq('message_id', messageSid);
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Twilio webhook error:', error);
    return new NextResponse('OK', { status: 200 }); // Always return 200 to prevent retries
  }
}
