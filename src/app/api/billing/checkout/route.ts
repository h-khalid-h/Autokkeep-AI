import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { getStripeClient, PLAN_PRICES, type PlanId } from '@/lib/stripe';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'checkout' });
    if (limited) return limited;

    const supabase = await createServerClient();
    const db = supabase as unknown as SupabaseQueryClient;
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return NextResponse.json(
        { error: 'Billing is not configured. Contact support.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { planId, entityCount = 1 } = body;

    if (!planId || !PLAN_PRICES[planId as PlanId]) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      );
    }

    const priceId = PLAN_PRICES[planId as PlanId];
    if (!priceId) {
      return NextResponse.json(
        { error: 'Plan pricing not configured. Contact sales.' },
        { status: 503 }
      );
    }

    // Get or create Stripe customer
    const { data: membership } = await db
      .from('team_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    const orgId = membership?.org_id;

    // Check for existing Stripe customer
    let customerId: string | undefined;
    if (orgId) {
      const { data: org } = await db
        .from('organizations')
        .select('stripe_customer_id')
        .eq('id', orgId)
        .single();
      customerId = org?.stripe_customer_id || undefined;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: 'Server configuration error: APP_URL not set' }, { status: 500 });
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      mode: 'subscription',
      line_items: [{
        price: priceId,
        quantity: Math.max(1, Math.min(entityCount, 100)),
      }],
      success_url: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing?checkout=cancelled`,
      subscription_data: {
        metadata: {
          org_id: orgId || '',
          user_id: user.id,
          plan_id: planId,
        },
      },
      metadata: {
        org_id: orgId || '',
        user_id: user.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    captureException(error, { tags: { route: 'billing/checkout' } });
    console.error('[Checkout] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
