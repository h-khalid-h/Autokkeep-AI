// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Webhook Retry Queue (In-Memory)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// In-memory webhook delivery queue with exponential backoff.
// Can be migrated to Redis/DB later by swapping the storage layer.

import { createLogger } from '@/lib/logger';

const log = createLogger('webhook-retry-queue');

// ── Types ────────────────────────────────────────────────────────────────────

export interface WebhookDelivery {
  id: string;
  url: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  status: 'pending' | 'delivered' | 'failed' | 'exhausted';
  lastError: string | null;
  createdAt: string;
}

export interface WebhookDeliveryResult {
  id: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  attempt: number;
}

export interface WebhookRetryQueue {
  enqueue(url: string, payload: Record<string, unknown>, headers?: Record<string, string>): WebhookDelivery;
  processQueue(): Promise<WebhookDeliveryResult[]>;
  getDelivery(id: string): WebhookDelivery | undefined;
  getPending(): WebhookDelivery[];
  getStats(): { pending: number; delivered: number; failed: number; exhausted: number };
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_000;         // 1 second
const MAX_DELAY_MS = 3_600_000;      // 1 hour

// ── Backoff Calculation ──────────────────────────────────────────────────────

/**
 * Calculates exponential backoff delay: baseDelay * 2^(attempt-1), capped at MAX_DELAY_MS.
 */
export function calculateBackoff(attempt: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
  return Math.min(delay, MAX_DELAY_MS);
}

// ── ID Generation ────────────────────────────────────────────────────────────

let idCounter = 0;

function generateId(): string {
  idCounter++;
  return `whd_${Date.now()}_${idCounter.toString(36)}`;
}

// ── Queue Implementation ─────────────────────────────────────────────────────

export function createWebhookRetryQueue(
  options: { maxAttempts?: number; fetchFn?: typeof fetch } = {}
): WebhookRetryQueue {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const fetchFn = options.fetchFn ?? fetch;
  const deliveries = new Map<string, WebhookDelivery>();

  return {
    enqueue(
      url: string,
      payload: Record<string, unknown>,
      headers: Record<string, string> = {}
    ): WebhookDelivery {
      const now = new Date().toISOString();
      const delivery: WebhookDelivery = {
        id: generateId(),
        url,
        payload,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        attempts: 0,
        maxAttempts,
        lastAttemptAt: null,
        nextRetryAt: now, // immediately eligible
        status: 'pending',
        lastError: null,
        createdAt: now,
      };

      deliveries.set(delivery.id, delivery);
      log.info('Webhook enqueued', { deliveryId: delivery.id, url });
      return delivery;
    },

    async processQueue(): Promise<WebhookDeliveryResult[]> {
      const now = new Date();
      const results: WebhookDeliveryResult[] = [];

      // Collect due deliveries
      const due: WebhookDelivery[] = [];
      for (const delivery of deliveries.values()) {
        if (
          (delivery.status === 'pending' || delivery.status === 'failed') &&
          delivery.nextRetryAt !== null &&
          new Date(delivery.nextRetryAt) <= now
        ) {
          due.push(delivery);
        }
      }

      // Process each due delivery
      for (const delivery of due) {
        delivery.attempts++;
        delivery.lastAttemptAt = now.toISOString();

        try {
          const response = await fetchFn(delivery.url, {
            method: 'POST',
            headers: delivery.headers,
            body: JSON.stringify(delivery.payload),
          });

          if (response.ok) {
            delivery.status = 'delivered';
            delivery.nextRetryAt = null;
            log.info('Webhook delivered', {
              deliveryId: delivery.id,
              attempt: delivery.attempts,
              statusCode: response.status,
            });
            results.push({
              id: delivery.id,
              success: true,
              statusCode: response.status,
              attempt: delivery.attempts,
            });
          } else {
            const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            delivery.lastError = errorMessage;

            if (delivery.attempts >= delivery.maxAttempts) {
              delivery.status = 'exhausted';
              delivery.nextRetryAt = null;
              log.error('Webhook exhausted all retries', {
                deliveryId: delivery.id,
                attempts: delivery.attempts,
                lastError: errorMessage,
              });
            } else {
              delivery.status = 'failed';
              const backoff = calculateBackoff(delivery.attempts);
              delivery.nextRetryAt = new Date(now.getTime() + backoff).toISOString();
              log.warn('Webhook delivery failed, scheduling retry', {
                deliveryId: delivery.id,
                attempt: delivery.attempts,
                nextRetryAt: delivery.nextRetryAt,
                error: errorMessage,
              });
            }

            results.push({
              id: delivery.id,
              success: false,
              statusCode: response.status,
              error: errorMessage,
              attempt: delivery.attempts,
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown fetch error';
          delivery.lastError = errorMessage;

          if (delivery.attempts >= delivery.maxAttempts) {
            delivery.status = 'exhausted';
            delivery.nextRetryAt = null;
            log.error('Webhook exhausted all retries (network error)', {
              deliveryId: delivery.id,
              attempts: delivery.attempts,
              lastError: errorMessage,
            });
          } else {
            delivery.status = 'failed';
            const backoff = calculateBackoff(delivery.attempts);
            delivery.nextRetryAt = new Date(now.getTime() + backoff).toISOString();
            log.warn('Webhook network error, scheduling retry', {
              deliveryId: delivery.id,
              attempt: delivery.attempts,
              nextRetryAt: delivery.nextRetryAt,
              error: errorMessage,
            });
          }

          results.push({
            id: delivery.id,
            success: false,
            error: errorMessage,
            attempt: delivery.attempts,
          });
        }
      }

      return results;
    },

    getDelivery(id: string): WebhookDelivery | undefined {
      return deliveries.get(id);
    },

    getPending(): WebhookDelivery[] {
      return Array.from(deliveries.values()).filter(
        (d) => d.status === 'pending' || d.status === 'failed'
      );
    },

    getStats(): { pending: number; delivered: number; failed: number; exhausted: number } {
      const stats = { pending: 0, delivered: 0, failed: 0, exhausted: 0 };
      for (const delivery of deliveries.values()) {
        stats[delivery.status]++;
      }
      return stats;
    },
  };
}

/** Default webhook retry queue instance */
export const webhookQueue = createWebhookRetryQueue();
