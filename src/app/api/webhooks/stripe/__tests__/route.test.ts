import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock Sentry
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

// Mock audit log
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock Redis — returns null (no Redis available, uses in-memory fallback)
vi.mock('@/lib/redis', () => ({
  default: vi.fn().mockReturnValue(null),
  getRedisClient: vi.fn().mockReturnValue(null),
}));

// Mock Supabase admin client
const mockFrom = vi.fn();
const mockAdminSupabase = { from: mockFrom };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdminSupabase),
}));

// Mock Stripe
const mockConstructEvent = vi.fn();
const mockStripe = {
  webhooks: { constructEvent: mockConstructEvent },
};

vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn().mockReturnValue(mockStripe),
  PLAN_DB_NAMES: {
    starter_monthly: 'starter',
    growth_monthly: 'smb_growth',
    pro_monthly: 'cpa_professional',
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  // When the chain is awaited directly (no .single()), return the resolved value
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  });

  // ── Signature Validation ──────────────────────────────────────────────────

  it('should return 400 if stripe-signature header is missing', async () => {
    const req = createRequest('{}');
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Missing signature');
  });

  it('should return 400 if webhook secret is not set', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const req = createRequest('{}', { 'stripe-signature': 'sig_test' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Missing signature');
  });

  it('should return 400 if signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const req = createRequest('{}', { 'stripe-signature': 'sig_invalid' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid signature');
  });

  // ── checkout.session.completed ────────────────────────────────────────────

  it('should process checkout.session.completed and update org', async () => {
    const event = {
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { org_id: 'org-1', plan_id: 'starter_monthly' },
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);

    const orgChain = createChainMock({ data: null, error: null });
    mockFrom.mockReturnValue(orgChain);

    const req = createRequest(JSON.stringify(event), { 'stripe-signature': 'sig_valid' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);

    // Verify org was updated
    expect(mockFrom).toHaveBeenCalledWith('organizations');
    expect(orgChain.update).toHaveBeenCalled();
  });

  // ── customer.subscription.updated ─────────────────────────────────────────

  it('should process customer.subscription.updated', async () => {
    const event = {
      id: 'evt_sub_updated_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_123',
          status: 'active',
          metadata: { org_id: 'org-1', plan_id: 'growth_monthly' },
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);

    const orgChain = createChainMock({ data: null, error: null });
    mockFrom.mockReturnValue(orgChain);

    const req = createRequest(JSON.stringify(event), { 'stripe-signature': 'sig_valid' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it('should skip duplicate events (idempotency)', async () => {
    const event = {
      id: 'evt_duplicate_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { org_id: 'org-1', plan_id: 'starter_monthly' },
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);

    const orgChain = createChainMock({ data: null, error: null });
    mockFrom.mockReturnValue(orgChain);

    // First call — should process
    const req1 = createRequest(JSON.stringify(event), { 'stripe-signature': 'sig_valid' });
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);

    // Second call with same event ID — should skip (idempotent)
    const req2 = createRequest(JSON.stringify(event), { 'stripe-signature': 'sig_valid' });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.received).toBe(true);
  });

  // ── Unhandled event type ──────────────────────────────────────────────────

  it('should return 200 for unhandled event types', async () => {
    const event = {
      id: 'evt_unhandled_1',
      type: 'some.unknown.event',
      data: { object: {} },
    };
    mockConstructEvent.mockReturnValue(event);

    const req = createRequest(JSON.stringify(event), { 'stripe-signature': 'sig_valid' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });
});
