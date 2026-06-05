import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/crypto', () => ({
  decryptToken: vi.fn((t: string) => `decrypted_${t}`),
  encryptToken: vi.fn((t: string) => `encrypted_${t}`),
}));

vi.mock('@/lib/billing/plans', () => ({
  checkPlanLimits: vi.fn().mockResolvedValue({ allowed: true }),
}));

const mockDispatchReceiptRequest = vi.fn();
const mockDispatchWithFallback = vi.fn();

vi.mock('@/lib/channels/dispatcher', () => ({
  dispatchReceiptRequest: mockDispatchReceiptRequest,
  dispatchWithFallback: mockDispatchWithFallback,
}));

const mockDb = { from: vi.fn() };

const mockAuthContext = {
  user: { id: 'user-1', email: 'user@example.com' },
  membership: { id: 'tm-1', org_id: 'org-1', role: 'owner' },
  db: mockDb,
  entityIds: ['entity-1'],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/channels/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

const VALID_UUID = 'a0000000-0000-4000-8000-000000000001';
const VALID_ENTITY_ID = 'b0000000-0000-4000-8000-000000000001';

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('POST /api/channels/dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ transactionId: VALID_UUID, entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should dispatch notification to the correct channel', async () => {
    const entityChain = createChainMock({ data: { id: VALID_ENTITY_ID }, error: null });
    const txChain = createChainMock({
      data: {
        id: VALID_UUID,
        entity_id: VALID_ENTITY_ID,
        merchant_name: 'Coffee Shop',
        merchant_raw: 'COFFEE SHOP #123',
        amount: '4.50',
        date: '2025-01-15',
        card_last4: '1234',
        card_holder: 'John Doe',
        category_ai: '6200',
        gl_code: '6200',
        confidence: '0.95',
      },
      error: null,
    });
    const channelChain = createChainMock({
      data: [
        { id: 'ch-1', channel_type: 'slack', channel_id: 'C12345', access_token: 'tok', entity_id: VALID_ENTITY_ID, status: 'active' },
      ],
      error: null,
    });
    const dedupChain = createChainMock({ data: [], error: null });
    const insertChain = createChainMock({ data: null, error: null });

    let receiptRequestsCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      if (table === 'channel_connections') return channelChain;
      if (table === 'receipt_requests') {
        receiptRequestsCallCount++;
        if (receiptRequestsCallCount === 1) return dedupChain;
        return insertChain;
      }
      return createChainMock({ data: null, error: null });
    });

    mockDispatchReceiptRequest.mockResolvedValue({
      success: true,
      channel: 'slack',
      messageId: 'msg-123',
    });

    const req = createPostRequest({ transactionId: VALID_UUID, entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.channel).toBe('slack');
    expect(json.messageId).toBe('msg-123');
    expect(mockDispatchReceiptRequest).toHaveBeenCalledTimes(1);
  });

  it('should return 404 when no active channels are connected', async () => {
    const entityChain = createChainMock({ data: { id: VALID_ENTITY_ID }, error: null });
    const txChain = createChainMock({
      data: {
        id: VALID_UUID,
        entity_id: VALID_ENTITY_ID,
        merchant_name: 'Shop',
        merchant_raw: null,
        amount: '10.00',
        date: '2025-01-15',
        card_last4: null,
        card_holder: null,
        category_ai: null,
        gl_code: null,
        confidence: null,
      },
      error: null,
    });
    const channelChain = createChainMock({ data: [], error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      if (table === 'channel_connections') return channelChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ transactionId: VALID_UUID, entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('No active channels');
  });

  it('should handle dispatch failure gracefully', async () => {
    const entityChain = createChainMock({ data: { id: VALID_ENTITY_ID }, error: null });
    const txChain = createChainMock({
      data: {
        id: VALID_UUID,
        entity_id: VALID_ENTITY_ID,
        merchant_name: 'Shop',
        merchant_raw: null,
        amount: '25.00',
        date: '2025-02-01',
        card_last4: '5678',
        card_holder: 'Jane',
        category_ai: null,
        gl_code: null,
        confidence: null,
      },
      error: null,
    });
    const channelChain = createChainMock({
      data: [
        { id: 'ch-1', channel_type: 'sms', channel_id: '+15551234567', access_token: null, entity_id: VALID_ENTITY_ID, status: 'active' },
      ],
      error: null,
    });
    const dedupChain = createChainMock({ data: [], error: null });
    const insertChain = createChainMock({ data: null, error: null });

    let receiptRequestsCallCount2 = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      if (table === 'channel_connections') return channelChain;
      if (table === 'receipt_requests') {
        receiptRequestsCallCount2++;
        if (receiptRequestsCallCount2 === 1) return dedupChain;
        return insertChain;
      }
      return createChainMock({ data: null, error: null });
    });

    mockDispatchReceiptRequest.mockResolvedValue({
      success: false,
      channel: 'sms',
      error: 'SMS provider unavailable',
    });

    const req = createPostRequest({ transactionId: VALID_UUID, entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('SMS provider unavailable');
  });

  it('should use dispatchWithFallback when preferredChannel is specified', async () => {
    const entityChain = createChainMock({ data: { id: VALID_ENTITY_ID }, error: null });
    const txChain = createChainMock({
      data: {
        id: VALID_UUID,
        entity_id: VALID_ENTITY_ID,
        merchant_name: 'Store',
        merchant_raw: null,
        amount: '50.00',
        date: '2025-03-01',
        card_last4: null,
        card_holder: null,
        category_ai: null,
        gl_code: null,
        confidence: null,
      },
      error: null,
    });
    const channelChain = createChainMock({
      data: [
        { id: 'ch-1', channel_type: 'email', channel_id: 'user@test.com', access_token: null, entity_id: VALID_ENTITY_ID, status: 'active' },
        { id: 'ch-2', channel_type: 'slack', channel_id: 'C999', access_token: 'tok', entity_id: VALID_ENTITY_ID, status: 'active' },
      ],
      error: null,
    });
    const dedupChain = createChainMock({ data: [], error: null });
    const insertChain = createChainMock({ data: null, error: null });

    let receiptRequestsCallCount3 = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      if (table === 'channel_connections') return channelChain;
      if (table === 'receipt_requests') {
        receiptRequestsCallCount3++;
        if (receiptRequestsCallCount3 === 1) return dedupChain;
        return insertChain;
      }
      return createChainMock({ data: null, error: null });
    });

    mockDispatchWithFallback.mockResolvedValue({
      success: true,
      channel: 'email',
      messageId: 'email-msg-1',
    });

    const req = createPostRequest({
      transactionId: VALID_UUID,
      entityId: VALID_ENTITY_ID,
      preferredChannel: 'email',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.channel).toBe('email');
    expect(mockDispatchWithFallback).toHaveBeenCalledTimes(1);
    expect(mockDispatchReceiptRequest).not.toHaveBeenCalled();
  });
});
