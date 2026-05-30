import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { getStripeClient } from '@/lib/stripe';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'portal' });
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
        { error: 'Billing is not configured' },
        { status: 503 }
      );
    }

    // Get the org's Stripe customer ID
    const { data: membership } = await db
      .from('team_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership?.org_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
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

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error('[Portal] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
