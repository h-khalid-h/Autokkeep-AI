import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { getStripeClient } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const rawBody = await request.text();
    const sig = request.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const supabase = createAdminClient();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orgId = session.metadata?.org_id;
        const customerId = session.customer as string;

        if (orgId && customerId) {
          // Link Stripe customer to org
          await (supabase as any)
            .from('organizations')
            .update({
              stripe_customer_id: customerId,
              plan: session.metadata?.plan_id || 'starter',
              updated_at: new Date().toISOString(),
            })
            .eq('id', orgId);

          await writeAuditLog({
            supabase,
            entityId: orgId,
            actorId: 'stripe',
            actorType: 'system',
            action: 'create',
            targetType: 'subscription',
            targetId: session.subscription as string,
            details: { event: event.type, plan: session.metadata?.plan_id },
            request,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const orgId = subscription.metadata?.org_id;

        if (orgId) {
          const status = subscription.status;
          await (supabase as any)
            .from('organizations')
            .update({
              subscription_status: status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', orgId);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const orgId = subscription.metadata?.org_id;

        if (orgId) {
          await (supabase as any)
            .from('organizations')
            .update({
              subscription_status: 'canceled',
              plan: 'free',
              updated_at: new Date().toISOString(),
            })
            .eq('id', orgId);

          await writeAuditLog({
            supabase,
            entityId: orgId,
            actorId: 'stripe',
            actorType: 'system',
            action: 'delete',
            targetType: 'subscription',
            targetId: subscription.id,
            details: { event: event.type },
            request,
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;
        console.warn(`[Stripe Webhook] Payment failed for customer ${customerId}`);
        break;
      }

      default:
        console.info(`[Stripe Webhook] Unhandled event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    captureException(error, { tags: { route: 'webhooks/stripe' } });
    console.error('[Stripe Webhook] Error:', error);
    return NextResponse.json({ received: true });
  }
}
