import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  createWebhookEventDispatcher,
  signPayload,
  type WebhookEventDispatcher,
  type WebhookEvent,
} from './events';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockQueue() {
  return {
    enqueue: vi.fn().mockReturnValue({ id: 'whd_mock', status: 'pending' }),
    processQueue: vi.fn().mockResolvedValue([]),
    getDelivery: vi.fn(),
    getPending: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockReturnValue({ pending: 0, delivered: 0, failed: 0, exhausted: 0 }),
  };
}

function makeEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: 'whe_test_1',
    type: 'transaction.created',
    timestamp: '2026-01-01T00:00:00.000Z',
    orgId: 'org_1',
    entityId: 'entity_1',
    data: { transactionId: 'txn_1', amount: 100 },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Webhook Event Dispatcher', () => {
  let dispatcher: WebhookEventDispatcher;
  let mockQueue: ReturnType<typeof createMockQueue>;

  beforeEach(() => {
    mockQueue = createMockQueue();
    dispatcher = createWebhookEventDispatcher({ queue: mockQueue as never });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── subscribe ────────────────────────────────────────────────────────────

  it('subscribe creates a subscription with correct fields', () => {
    const sub = dispatcher.subscribe(
      'org_1',
      'https://hooks.zapier.com/abc',
      ['transaction.created', 'transaction.approved'],
      'my-secret-key-12345'
    );

    expect(sub.id).toMatch(/^whs_/);
    expect(sub.orgId).toBe('org_1');
    expect(sub.url).toBe('https://hooks.zapier.com/abc');
    expect(sub.events).toEqual(['transaction.created', 'transaction.approved']);
    expect(sub.secret).toBe('my-secret-key-12345');
    expect(sub.isActive).toBe(true);
    expect(sub.createdAt).toBeDefined();
  });

  // ── dispatch ─────────────────────────────────────────────────────────────

  it('dispatch sends to matching subscriptions via retry queue', async () => {
    dispatcher.subscribe(
      'org_1',
      'https://hooks.zapier.com/abc',
      ['transaction.created'],
      'secret1'
    );

    const event = makeEvent();
    await dispatcher.dispatch(event);

    expect(mockQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      'https://hooks.zapier.com/abc',
      expect.objectContaining({
        id: 'whe_test_1',
        type: 'transaction.created',
        orgId: 'org_1',
      }),
      expect.objectContaining({
        'X-Webhook-Signature': expect.any(String),
      })
    );
  });

  it('dispatch does NOT send to subscriptions for non-matching event types', async () => {
    dispatcher.subscribe(
      'org_1',
      'https://hooks.zapier.com/abc',
      ['transaction.approved'], // subscribed to approved, not created
      'secret1'
    );

    const event = makeEvent({ type: 'transaction.created' });
    await dispatcher.dispatch(event);

    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });

  it('dispatch does NOT send to subscriptions for non-matching orgId', async () => {
    dispatcher.subscribe(
      'org_2', // different org
      'https://hooks.zapier.com/abc',
      ['transaction.created'],
      'secret1'
    );

    const event = makeEvent({ orgId: 'org_1' });
    await dispatcher.dispatch(event);

    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });

  it('dispatch sends to multiple matching subscriptions', async () => {
    dispatcher.subscribe(
      'org_1',
      'https://hooks.zapier.com/abc',
      ['transaction.created'],
      'secret1'
    );
    dispatcher.subscribe(
      'org_1',
      'https://hooks.make.com/xyz',
      ['transaction.created', 'transaction.updated'],
      'secret2'
    );

    const event = makeEvent();
    await dispatcher.dispatch(event);

    expect(mockQueue.enqueue).toHaveBeenCalledTimes(2);
  });

  // ── unsubscribe ──────────────────────────────────────────────────────────

  it('unsubscribe removes subscription and returns true', () => {
    const sub = dispatcher.subscribe(
      'org_1',
      'https://hooks.zapier.com/abc',
      ['transaction.created'],
      'secret1'
    );

    const result = dispatcher.unsubscribe(sub.id);
    expect(result).toBe(true);
    expect(dispatcher.getSubscriptions('org_1')).toHaveLength(0);
  });

  it('unsubscribe returns false for unknown subscription', () => {
    expect(dispatcher.unsubscribe('nonexistent')).toBe(false);
  });

  // ── HMAC signature ──────────────────────────────────────────────────────

  it('HMAC-SHA256 signature is correct and verifiable', async () => {
    const secret = 'test-webhook-secret-key';
    dispatcher.subscribe(
      'org_1',
      'https://hooks.zapier.com/abc',
      ['transaction.created'],
      secret
    );

    const event = makeEvent();
    await dispatcher.dispatch(event);

    // Extract the signature from the enqueue call
    const enqueueCall = mockQueue.enqueue.mock.calls[0];
    const payload = enqueueCall[1];
    const headers = enqueueCall[2];
    const sentSignature = headers['X-Webhook-Signature'];

    // Recompute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    expect(sentSignature).toBe(expectedSignature);
    expect(sentSignature).toHaveLength(64); // SHA256 hex = 64 chars
  });

  // ── signPayload helper ──────────────────────────────────────────────────

  it('signPayload produces deterministic HMAC-SHA256 output', () => {
    const payload = { foo: 'bar', num: 42 };
    const secret = 'my-secret';

    const sig1 = signPayload(payload, secret);
    const sig2 = signPayload(payload, secret);

    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64);

    // Different payload → different signature
    const sig3 = signPayload({ foo: 'baz' }, secret);
    expect(sig3).not.toBe(sig1);

    // Different secret → different signature
    const sig4 = signPayload(payload, 'other-secret');
    expect(sig4).not.toBe(sig1);
  });

  // ── event history ────────────────────────────────────────────────────────

  it('event history stores dispatched events', async () => {
    const event = makeEvent();
    await dispatcher.dispatch(event);

    const history = dispatcher.getEventHistory('org_1');
    expect(history).toHaveLength(1);
    expect(history[0].type).toBe('transaction.created');
    expect(history[0].orgId).toBe('org_1');
  });

  it('event history respects limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await dispatcher.dispatch(
        makeEvent({ id: `whe_${i}`, type: 'transaction.created' })
      );
    }

    const limited = dispatcher.getEventHistory('org_1', 3);
    expect(limited).toHaveLength(3);
  });

  it('event history only returns events for the requested org', async () => {
    await dispatcher.dispatch(makeEvent({ orgId: 'org_1', id: 'whe_1' }));
    await dispatcher.dispatch(makeEvent({ orgId: 'org_2', id: 'whe_2' }));
    await dispatcher.dispatch(makeEvent({ orgId: 'org_1', id: 'whe_3' }));

    const org1History = dispatcher.getEventHistory('org_1');
    expect(org1History).toHaveLength(2);

    const org2History = dispatcher.getEventHistory('org_2');
    expect(org2History).toHaveLength(1);
  });

  // ── inactive subscriptions ───────────────────────────────────────────────

  it('inactive subscriptions are skipped during dispatch', async () => {
    const sub = dispatcher.subscribe(
      'org_1',
      'https://hooks.zapier.com/abc',
      ['transaction.created'],
      'secret1'
    );

    // Deactivate the subscription by removing and re-checking
    // Since the interface doesn't expose deactivation, we test via unsubscribe
    dispatcher.unsubscribe(sub.id);

    const event = makeEvent();
    await dispatcher.dispatch(event);

    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });

  // ── getSubscriptions ─────────────────────────────────────────────────────

  it('getSubscriptions returns only subscriptions for the given org', () => {
    dispatcher.subscribe('org_1', 'https://a.com', ['transaction.created'], 'secret1');
    dispatcher.subscribe('org_2', 'https://b.com', ['transaction.created'], 'secret2');
    dispatcher.subscribe('org_1', 'https://c.com', ['transaction.approved'], 'secret3');

    const org1Subs = dispatcher.getSubscriptions('org_1');
    expect(org1Subs).toHaveLength(2);

    const org2Subs = dispatcher.getSubscriptions('org_2');
    expect(org2Subs).toHaveLength(1);
    expect(org2Subs[0].url).toBe('https://b.com');
  });
});
