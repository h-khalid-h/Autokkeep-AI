import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2026-04-22.dahlia',
  });
}

// POST /api/billing/portal — Create Stripe Customer Portal session
export async function POST(request: NextRequest) {
  try {
    const { orgId } = await request.json();

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
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

    const { data: sub } = await (supabase as any)
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('org_id', orgId)
      .single();

    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Portal creation failed' },
      { status: 500 }
    );
  }
}
