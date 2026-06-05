import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-helpers';
import { getApiAuthContext } from '@/lib/api-auth';
import { getStripeClient } from '@/lib/stripe';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'portal' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const stripe = getStripeClient();
    if (!stripe) {
      return NextResponse.json(
        { error: 'Billing is not configured' },
        { status: 503 }
      );
    }

    const { data: org } = await db
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', membership.org_id)
      .single();

    if (!org?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No active subscription. Please subscribe first.' },
        { status: 404 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: 'Server configuration error: APP_URL not set' }, { status: 500 });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${appUrl}/dashboard`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    return handleApiError(error, 'billing/portal', 'Failed to create portal session');
  }
}
