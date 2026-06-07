import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createWebhookRetryQueue,
  calculateBackoff,
  type WebhookRetryQueue,
} from './retry-queue';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockFetch(status: number = 200, ok: boolean = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Internal Server Error',
  });
}

function createFailingFetch(errorMessage: string = 'Network error') {
  return vi.fn().mockRejectedValue(new Error(errorMessage));
}

// Suppress logger output during tests
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Webhook Retry Queue', () => {
  let queue: WebhookRetryQueue;
  let mockFetch: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    mockFetch = createMockFetch();
    queue = createWebhookRetryQueue({ fetchFn: mockFetch as unknown as typeof fetch });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enqueue creates a pending delivery with correct fields', () => {
    const delivery = queue.enqueue(
      'https://example.com/webhook',
      { event: 'transaction.created', id: '123' },
      { 'X-Webhook-Secret': 'secret' }
    );

    expect(delivery.status).toBe('pending');
    expect(delivery.url).toBe('https://example.com/webhook');
    expect(delivery.payload).toEqual({ event: 'transaction.created', id: '123' });
    expect(delivery.headers['Content-Type']).toBe('application/json');
    expect(delivery.headers['X-Webhook-Secret']).toBe('secret');
    expect(delivery.attempts).toBe(0);
    expect(delivery.maxAttempts).toBe(5);
    expect(delivery.lastAttemptAt).toBeNull();
    expect(delivery.lastError).toBeNull();
    expect(delivery.id).toMatch(/^whd_/);
    expect(delivery.createdAt).toBeDefined();
  });

  it('processQueue delivers to URL and marks as delivered', async () => {
    queue.enqueue('https://example.com/hook', { test: true });

    const results = await queue.processQueue();

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].statusCode).toBe(200);
    expect(results[0].attempt).toBe(1);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ test: true }),
      })
    );

    // Delivery is now marked as delivered
    const stats = queue.getStats();
    expect(stats.delivered).toBe(1);
    expect(stats.pending).toBe(0);
  });

  it('failed delivery gets status "failed" and is retried', async () => {
    const failFetch = createMockFetch(500, false);
    const failQueue = createWebhookRetryQueue({ fetchFn: failFetch as unknown as typeof fetch });

    const delivery = failQueue.enqueue('https://example.com/hook', { test: true });

    const results = await failQueue.processQueue();

    expect(results[0].success).toBe(false);
    expect(results[0].statusCode).toBe(500);

    const updated = failQueue.getDelivery(delivery.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.attempts).toBe(1);
    expect(updated?.lastError).toContain('500');
    expect(updated?.nextRetryAt).not.toBeNull();
  });

  it('calculates exponential backoff correctly', () => {
    expect(calculateBackoff(1)).toBe(1_000);      // 1s * 2^0
    expect(calculateBackoff(2)).toBe(2_000);      // 1s * 2^1
    expect(calculateBackoff(3)).toBe(4_000);      // 1s * 2^2
    expect(calculateBackoff(4)).toBe(8_000);      // 1s * 2^3
    expect(calculateBackoff(5)).toBe(16_000);     // 1s * 2^4
    // Should cap at 1 hour
    expect(calculateBackoff(30)).toBe(3_600_000);
  });

  it('exhausts after maxAttempts and sets status to "exhausted"', async () => {
    const failFetch = createMockFetch(500, false);
    const failQueue = createWebhookRetryQueue({
      maxAttempts: 2,
      fetchFn: failFetch as unknown as typeof fetch,
    });

    const delivery = failQueue.enqueue('https://example.com/hook', {});

    // First attempt
    await failQueue.processQueue();
    let updated = failQueue.getDelivery(delivery.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.attempts).toBe(1);

    // Override nextRetryAt to make it immediately eligible
    if (updated) updated.nextRetryAt = new Date(0).toISOString();

    // Second attempt (max)
    await failQueue.processQueue();
    updated = failQueue.getDelivery(delivery.id);
    expect(updated?.status).toBe('exhausted');
    expect(updated?.attempts).toBe(2);
    expect(updated?.nextRetryAt).toBeNull();
  });

  it('getStats returns correct counts for all statuses', async () => {
    const failFetch = createMockFetch(500, false);
    const mixedQueue = createWebhookRetryQueue({
      maxAttempts: 1,
      fetchFn: failFetch as unknown as typeof fetch,
    });

    // Enqueue 3 deliveries
    mixedQueue.enqueue('https://example.com/1', {});
    mixedQueue.enqueue('https://example.com/2', {});
    mixedQueue.enqueue('https://example.com/3', {});

    let stats = mixedQueue.getStats();
    expect(stats.pending).toBe(3);
    expect(stats.delivered).toBe(0);

    // Process — all fail with maxAttempts=1, so they become exhausted
    await mixedQueue.processQueue();

    stats = mixedQueue.getStats();
    expect(stats.exhausted).toBe(3);
    expect(stats.pending).toBe(0);
  });

  it('network errors are handled gracefully', async () => {
    const netFailFetch = createFailingFetch('ECONNREFUSED');
    const netQueue = createWebhookRetryQueue({ fetchFn: netFailFetch as unknown as typeof fetch });

    const delivery = netQueue.enqueue('https://example.com/hook', { data: 1 });
    const results = await netQueue.processQueue();

    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('ECONNREFUSED');

    const updated = netQueue.getDelivery(delivery.id);
    expect(updated?.lastError).toBe('ECONNREFUSED');
    expect(updated?.status).toBe('failed');
  });

  it('getPending returns only pending and failed deliveries', async () => {
    queue.enqueue('https://example.com/1', {});
    queue.enqueue('https://example.com/2', {});

    // Process — both should succeed
    await queue.processQueue();

    // Both delivered, nothing pending
    expect(queue.getPending()).toHaveLength(0);

    // Add one more
    queue.enqueue('https://example.com/3', {});
    expect(queue.getPending()).toHaveLength(1);
  });

  it('does not process deliveries whose nextRetryAt is in the future', async () => {
    const delivery = queue.enqueue('https://example.com/hook', {});

    // Set nextRetryAt to far future
    const stored = queue.getDelivery(delivery.id);
    if (stored) stored.nextRetryAt = new Date(Date.now() + 999_999_999).toISOString();

    const results = await queue.processQueue();
    expect(results).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('getDelivery returns undefined for unknown IDs', () => {
    expect(queue.getDelivery('nonexistent')).toBeUndefined();
  });
});
