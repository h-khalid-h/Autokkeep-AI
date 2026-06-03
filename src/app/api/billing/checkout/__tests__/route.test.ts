import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock Sentry
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

// Mock getApiAuthContext
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

// Mock Stripe client
const mockCreateCheckoutSession = vi.fn().mockResolvedValue({
  url: 'https://checkout.stripe.com/session/test_123',
});
const mockStripe = {
  checkout: {
    sessions: {
      create: mockCreateCheckoutSession,
    },
  },
};

vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn().mockReturnValue(mockStripe),
  PLAN_PRICES: {
    starter_monthly: 'price_starter_test',
    growth_monthly: 'price_growth_test',
    pro_monthly: 'price_pro_test',
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(method: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/billing/checkout', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://autokkeep.com';
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createRequest('POST', { planId: 'starter_monthly' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('should return 400 for invalid plan', async () => {
    const req = createRequest('POST', { planId: 'nonexistent_plan' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid plan');
  });

  it('should return 400 for missing planId', async () => {
    const req = createRequest('POST', {});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid plan');
  });

  // ── Happy Path ────────────────────────────────────────────────────────────

  it('should create checkout session with valid plan', async () => {
    // Mock org lookup for stripe_customer_id
    const orgChain = createChainMock({ data: { stripe_customer_id: null }, error: null });
    mockDb.from.mockReturnValue(orgChain);

    const req = createRequest('POST', { planId: 'starter_monthly' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe('https://checkout.stripe.com/session/test_123');
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('should use existing Stripe customer ID if available', async () => {
    const orgChain = createChainMock({
      data: { stripe_customer_id: 'cus_existing_123' },
      error: null,
    });
    mockDb.from.mockReturnValue(orgChain);

    const req = createRequest('POST', { planId: 'growth_monthly' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing_123' })
    );
  });
});
