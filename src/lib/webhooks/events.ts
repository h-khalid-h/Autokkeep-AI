// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Webhook Event Dispatcher
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Dispatches webhook events to external integrations (Zapier, Make, etc.).
// Uses in-memory subscription store and HMAC-SHA256 signed payloads.
// Events are enqueued via the retry queue for reliable delivery.

import crypto from 'crypto';
import { createLogger } from '@/lib/logger';
import { webhookQueue } from '@/lib/webhooks/retry-queue';

const log = createLogger('webhook-events');

// ── Types ────────────────────────────────────────────────────────────────────

export type WebhookEventType =
  | 'transaction.created'
  | 'transaction.updated'
  | 'transaction.categorized'
  | 'transaction.approved'
  | 'transaction.rejected'
  | 'transaction.split'
  | 'month_end.closed'
  | 'alert.triggered'
  | 'rule.created';

export const VALID_EVENT_TYPES: WebhookEventType[] = [
  'transaction.created',
  'transaction.updated',
  'transaction.categorized',
  'transaction.approved',
  'transaction.rejected',
  'transaction.split',
  'month_end.closed',
  'alert.triggered',
  'rule.created',
];

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  orgId: string;
  entityId: string;
  data: Record<string, unknown>;
}

export interface WebhookSubscription {
  id: string;
  orgId: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  isActive: boolean;
  createdAt: string;
}

export interface WebhookEventDispatcher {
  dispatch(event: WebhookEvent): Promise<void>;
  subscribe(orgId: string, url: string, events: WebhookEventType[], secret: string): WebhookSubscription;
  unsubscribe(subscriptionId: string): boolean;
  getSubscriptions(orgId: string): WebhookSubscription[];
  getEventHistory(orgId: string, limit?: number): WebhookEvent[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_EVENT_HISTORY = 500;

// ── ID Generation ────────────────────────────────────────────────────────────

let subIdCounter = 0;
let eventIdCounter = 0;

function generateSubscriptionId(): string {
  subIdCounter++;
  return `whs_${Date.now()}_${subIdCounter.toString(36)}`;
}

function generateEventId(): string {
  eventIdCounter++;
  return `whe_${Date.now()}_${eventIdCounter.toString(36)}`;
}

// ── HMAC Signing ─────────────────────────────────────────────────────────────

/**
 * Generates an HMAC-SHA256 signature for webhook payload verification.
 * The receiver can verify authenticity by recomputing the signature.
 */
export function signPayload(payload: Record<string, unknown>, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

// ── Dispatcher Implementation ────────────────────────────────────────────────

export function createWebhookEventDispatcher(
  options: { queue?: typeof webhookQueue } = {}
): WebhookEventDispatcher {
  const queue = options.queue ?? webhookQueue;
  const subscriptions = new Map<string, WebhookSubscription>();
  const eventHistory: WebhookEvent[] = [];

  return {
    async dispatch(event: WebhookEvent): Promise<void> {
      // Assign an ID if not present
      if (!event.id) {
        event.id = generateEventId();
      }

      // Store in circular buffer
      eventHistory.push(event);
      if (eventHistory.length > MAX_EVENT_HISTORY) {
        eventHistory.shift();
      }

      // Find matching subscriptions: same org + subscribed to event type + active
      const matching: WebhookSubscription[] = [];
      for (const sub of subscriptions.values()) {
        if (
          sub.orgId === event.orgId &&
          sub.isActive &&
          sub.events.includes(event.type)
        ) {
          matching.push(sub);
        }
      }

      if (matching.length === 0) {
        log.debug('No matching subscriptions for event', {
          eventType: event.type,
          orgId: event.orgId,
        });
        return;
      }

      // Enqueue delivery for each matching subscription
      for (const sub of matching) {
        const payload: Record<string, unknown> = {
          id: event.id,
          type: event.type,
          timestamp: event.timestamp,
          orgId: event.orgId,
          entityId: event.entityId,
          data: event.data,
        };

        const signature = signPayload(payload, sub.secret);

        queue.enqueue(sub.url, payload, {
          'X-Webhook-Signature': signature,
        });

        log.info('Webhook event enqueued', {
          eventId: event.id,
          eventType: event.type,
          subscriptionId: sub.id,
          url: sub.url,
        });
      }
    },

    subscribe(
      orgId: string,
      url: string,
      events: WebhookEventType[],
      secret: string
    ): WebhookSubscription {
      const subscription: WebhookSubscription = {
        id: generateSubscriptionId(),
        orgId,
        url,
        events,
        secret,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      subscriptions.set(subscription.id, subscription);
      log.info('Webhook subscription created', {
        subscriptionId: subscription.id,
        orgId,
        url,
        events,
      });

      return subscription;
    },

    unsubscribe(subscriptionId: string): boolean {
      const existed = subscriptions.delete(subscriptionId);
      if (existed) {
        log.info('Webhook subscription removed', { subscriptionId });
      }
      return existed;
    },

    getSubscriptions(orgId: string): WebhookSubscription[] {
      return Array.from(subscriptions.values()).filter(
        (sub) => sub.orgId === orgId
      );
    },

    getEventHistory(orgId: string, limit?: number): WebhookEvent[] {
      const orgEvents = eventHistory.filter((e) => e.orgId === orgId);
      const effectiveLimit = limit ?? 50;
      return orgEvents.slice(-effectiveLimit);
    },
  };
}

/** Default webhook event dispatcher singleton */
export const webhookEventDispatcher = createWebhookEventDispatcher();
