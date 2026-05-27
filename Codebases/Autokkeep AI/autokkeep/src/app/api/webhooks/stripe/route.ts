
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2026-04-22.dahlia',
  });
}

// Reverse-map Stripe price IDs back to canonical plan names
const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_ID_STARTER || '']: 'starter',
  [process.env.STRIPE_PRICE_ID_SMB_GROWTH || '']: 'smb_growth',
  [process.env.STRIPE_PRICE_ID_CPA_PROFESSIONAL || '']: 'cpa_professional',
  [process.env.STRIPE_PRICE_ID_CPA_ENTERPRISE || '']: 'cpa_enterprise',
};

// POST /api/webhooks/stripe — Handle Stripe webhook events
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = getStripe().webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || ''
      );
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const supabase = createAdminClient();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Record<string, any>;
        const orgId = session.metadata?.org_id;
        const plan = session.metadata?.plan;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (orgId && plan) {
          if (!subscriptionId) {
            console.error('[Stripe Webhook] checkout.session.completed missing subscription ID');
            break;
          }

          await (supabase as any).from('subscriptions').upsert(
            {
              org_id: orgId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              plan: plan as 'starter' | 'smb_growth' | 'cpa_professional' | 'cpa_enterprise',
              status: 'active',
            },
            { onConflict: 'stripe_subscription_id' }
          );

          await (supabase as any).from('audit_log').insert({
            action: 'create',
            target_type: 'subscription',
            target_id: subscriptionId,
            actor_type: 'system',
            details: { plan, customer_id: customerId, event: 'checkout.session.completed' },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Record<string, any>;

        const updateData: Record<string, any> = {
          status: subscription.status === 'active' ? 'active' : subscription.status,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        };

        // Extract new price ID and reverse-map to plan name
        const newPriceId = subscription.items?.data?.[0]?.price?.id;
        if (newPriceId && PRICE_TO_PLAN[newPriceId]) {
          updateData.plan = PRICE_TO_PLAN[newPriceId];
        }

        await (supabase as any)
          .from('subscriptions')
          .update(updateData)
          .eq('stripe_subscription_id', subscription.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Record<string, any>;

        await (supabase as any)
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', subscription.id);

        await (supabase as any).from('audit_log').insert({
          action: 'delete',
          target_type: 'subscription',
          target_id: subscription.id,
          actor_type: 'system',
          details: { event: 'customer.subscription.deleted' },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Record<string, any>;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          await (supabase as any)
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subscriptionId);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Record<string, any>;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          // Check current status to prevent reactivating canceled subscriptions
          const { data: currentSub } = await (supabase as any)
            .from('subscriptions')
            .select('status')
            .eq('stripe_subscription_id', subscriptionId)
            .single();

          if (currentSub && currentSub.status !== 'canceled') {
            await (supabase as any)
              .from('subscriptions')
              .update({ status: 'active' })
              .eq('stripe_subscription_id', subscriptionId);
          }
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
