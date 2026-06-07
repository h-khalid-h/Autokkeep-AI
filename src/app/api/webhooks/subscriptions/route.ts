// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/webhooks/subscriptions — Webhook Subscription Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import {
  webhookEventDispatcher,
  VALID_EVENT_TYPES,
  type WebhookEventType,
} from '@/lib/webhooks/events';

/**
 * GET — List all webhook subscriptions for the authenticated org.
 */
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'wh-subs' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership } = ctx;

    const subscriptions = webhookEventDispatcher.getSubscriptions(membership.org_id);

    // Redact secrets in the response
    const redacted = subscriptions.map((sub) => ({
      id: sub.id,
      orgId: sub.orgId,
      url: sub.url,
      events: sub.events,
      isActive: sub.isActive,
      createdAt: sub.createdAt,
      // Show only last 4 chars of secret
      secret: sub.secret.length > 4
        ? `${'*'.repeat(sub.secret.length - 4)}${sub.secret.slice(-4)}`
        : '****',
    }));

    return NextResponse.json({ subscriptions: redacted });
  } catch (error) {
    return handleApiError(error, 'GET /api/webhooks/subscriptions', 'Failed to fetch webhook subscriptions');
  }
}

/**
 * POST — Create a new webhook subscription.
 * Body: { url: string, events: WebhookEventType[], secret: string }
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'wh-subs-create' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership } = ctx;

    const body = await request.json();
    const { url, events, secret } = body;

    // Validate required fields
    if (!url || !events || !secret) {
      return NextResponse.json(
        { error: 'Missing required fields: url, events, secret' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return NextResponse.json(
          { error: 'URL must use HTTP or HTTPS protocol' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Validate event types
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'events must be a non-empty array of valid event types' },
        { status: 400 }
      );
    }

    const invalidEvents = events.filter(
      (e: string) => !VALID_EVENT_TYPES.includes(e as WebhookEventType)
    );
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid event types: ${invalidEvents.join(', ')}`,
          validEventTypes: VALID_EVENT_TYPES,
        },
        { status: 400 }
      );
    }

    // Validate secret length
    if (typeof secret !== 'string' || secret.length < 8) {
      return NextResponse.json(
        { error: 'Secret must be a string with at least 8 characters' },
        { status: 400 }
      );
    }

    const subscription = webhookEventDispatcher.subscribe(
      membership.org_id,
      url,
      events as WebhookEventType[],
      secret
    );

    return NextResponse.json(
      {
        subscription: {
          id: subscription.id,
          orgId: subscription.orgId,
          url: subscription.url,
          events: subscription.events,
          isActive: subscription.isActive,
          createdAt: subscription.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, 'POST /api/webhooks/subscriptions', 'Failed to create webhook subscription');
  }
}
