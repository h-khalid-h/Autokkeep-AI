import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2026-04-22.dahlia',
  });
}

// POST /api/billing/checkout — Create Stripe Checkout session
export async function POST(request: NextRequest) {
  try {
    const { orgId, plan, email } = await request.json();

    if (!orgId || !plan || !email) {
      return NextResponse.json(
        { error: 'Missing orgId, plan, or email' },
        { status: 400 }
      );
    }

    // Map plan to Stripe price ID
    const priceMap: Record<string, string | undefined> = {
      cpa_foundation: process.env.STRIPE_PRICE_ID_CPA_FOUNDATION,
      cpa_scale: process.env.STRIPE_PRICE_ID_CPA_SCALE,
      smb_basic: process.env.STRIPE_PRICE_ID_SMB_BASIC,
      smb_growth: process.env.STRIPE_PRICE_ID_SMB_GROWTH,
      smb_premium: process.env.STRIPE_PRICE_ID_SMB_PREMIUM,
    };

    const priceId = priceMap[plan];
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (membership.org_id !== orgId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if org already has a Stripe customer
    const { data: existingSub } = await (supabase as any)
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('org_id', orgId)
      .single();

    let customerId = existingSub?.stripe_customer_id;

    if (!customerId) {
      // Create Stripe customer
      const customer = await getStripe().customers.create({
        email,
        metadata: { org_id: orgId },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=true`,
      metadata: {
        org_id: orgId,
        plan,
      },
      subscription_data: {
        metadata: {
          org_id: orgId,
          plan,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Checkout failed' },
      { status: 500 }
    );
  }
}
