import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { getStripeClient, PLAN_DB_NAMES } from '@/lib/stripe';
import type { PlanId } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// Idempotency guard: track recently processed Stripe event IDs
const processedEventIds = new Set<string>();

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

    // Idempotency: skip if we've already processed this event
    if (processedEventIds.has(event.id)) {
      console.info(`[Stripe Webhook] Duplicate event ${event.id} — skipping`);
      return NextResponse.json({ received: true });
    }
    processedEventIds.add(event.id);
    // Prevent unbounded memory growth
    if (processedEventIds.size > 1000) {
      const oldest = processedEventIds.values().next().value;
      if (oldest) processedEventIds.delete(oldest);
    }

    const supabase = createAdminClient();
    const db = supabase as unknown as SupabaseQueryClient;

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orgId = session.metadata?.org_id;
        const customerId = session.customer as string;

        if (orgId && customerId) {
          // Link Stripe customer to org
          await db
            .from('organizations')
            .update({
              stripe_customer_id: customerId,
              plan: PLAN_DB_NAMES[session.metadata?.plan_id as PlanId] || session.metadata?.plan_id || 'starter',
              updated_at: new Date().toISOString(),
            })
            .eq('id', orgId);

          await writeAuditLog({
            supabase: db,
            entityId: orgId,
            actorId: '00000000-0000-0000-0000-000000000000',
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
        let orgId = subscription.metadata?.org_id;

        // Fallback: look up org by stripe_customer_id if metadata is missing
        if (!orgId && subscription.customer) {
          const { data: org } = await db
            .from('organizations')
            .select('id')
            .eq('stripe_customer_id', subscription.customer as string)
            .single();
          orgId = org?.id;
        }

        if (orgId) {
          const status = subscription.status;
          await db
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
        let orgId = subscription.metadata?.org_id;

        // Fallback: look up org by stripe_customer_id if metadata is missing
        if (!orgId && subscription.customer) {
          const { data: org } = await db
            .from('organizations')
            .select('id')
            .eq('stripe_customer_id', subscription.customer as string)
            .single();
          orgId = org?.id;
        }

        if (orgId) {
          await db
            .from('organizations')
            .update({
              subscription_status: 'canceled',
              plan: 'free',
              updated_at: new Date().toISOString(),
            })
            .eq('id', orgId);

          await writeAuditLog({
            supabase: db,
            entityId: orgId,
            actorId: '00000000-0000-0000-0000-000000000000',
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

        // Find org by stripe_customer_id and mark as past_due
        const { data: failedOrg } = await db
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (failedOrg) {
          await db
            .from('organizations')
            .update({
              subscription_status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('id', failedOrg.id);

          await writeAuditLog({
            supabase: db,
            entityId: failedOrg.id,
            actorId: '00000000-0000-0000-0000-000000000000',
            actorType: 'system',
            action: 'update',
            targetType: 'subscription',
            targetId: customerId,
            details: { event: event.type, status: 'past_due' },
            request,
          });
        }
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
