import { NextRequest, NextResponse } from 'next/server';
import { validateTwilioSignature } from '@/lib/channels/twilio';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// POST /api/webhooks/twilio — Handle Twilio status callbacks
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody));

    // Validate signature
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`;

    if (!process.env.TWILIO_AUTH_TOKEN) {
      console.error('TWILIO_AUTH_TOKEN is not configured');
      return new NextResponse('Webhook authentication not configured', { status: 500 });
    }

    if (!validateTwilioSignature(url, params, signature)) {
      return new NextResponse('Invalid signature', { status: 401 });
    }

    const messageStatus = params.MessageStatus;
    const messageSid = params.MessageSid;

    // Log delivery status
    if (messageStatus && messageSid) {
      const supabase = createAdminClient();
      const db = supabase as unknown as SupabaseQueryClient;

      // Update receipt request delivery status if applicable
      if (messageStatus === 'delivered' || messageStatus === 'read') {
        await db
          .from('receipt_requests')
          .update({ status: 'sent' })
          .eq('message_id', messageSid);
      }

      if (messageStatus === 'failed' || messageStatus === 'undelivered') {
        console.error(`Twilio message ${messageSid} failed: ${params.ErrorCode} - ${params.ErrorMessage}`);
        await db
          .from('receipt_requests')
          .update({ status: 'failed' })
          .eq('message_id', messageSid);
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Twilio webhook error:', error);
    return new NextResponse('OK', { status: 200 }); // Always return 200 to prevent retries
  }
}
