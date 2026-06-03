import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
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
const mockCreatePortalSession = vi.fn().mockResolvedValue({
  url: 'https://billing.stripe.com/session/test_portal_123',
});
const mockStripe = {
  billingPortal: {
    sessions: {
      create: mockCreatePortalSession,
    },
  },
};

vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn().mockReturnValue(mockStripe),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(method: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/billing/portal', {
    method,
    headers: { 'Content-Type': 'application/json' },
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
const { getStripeClient } = await import('@/lib/stripe');

describe('POST /api/billing/portal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://autokkeep.com';
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
    (getStripeClient as ReturnType<typeof vi.fn>).mockReturnValue(mockStripe);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createRequest('POST');
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── Stripe not configured ────────────────────────────────────────────────

  it('should return 503 when stripe is not configured', async () => {
    (getStripeClient as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const req = createRequest('POST');
    const res = await POST(req);

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toContain('Billing is not configured');
  });

  // ── No subscription ──────────────────────────────────────────────────────

  it('should return 404 when no stripe customer ID exists', async () => {
    const orgChain = createChainMock({ data: { stripe_customer_id: null }, error: null });
    mockDb.from.mockReturnValue(orgChain);

    const req = createRequest('POST');
    const res = await POST(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('No active subscription');
  });

  // ── Happy Path ────────────────────────────────────────────────────────────

  it('should create portal session and return URL', async () => {
    const orgChain = createChainMock({
      data: { stripe_customer_id: 'cus_test_123' },
      error: null,
    });
    mockDb.from.mockReturnValue(orgChain);

    const req = createRequest('POST');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe('https://billing.stripe.com/session/test_portal_123');
    expect(mockCreatePortalSession).toHaveBeenCalledWith({
      customer: 'cus_test_123',
      return_url: 'https://autokkeep.com/dashboard',
    });
  });

  // ── Missing APP_URL ───────────────────────────────────────────────────────

  it('should return 500 when APP_URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    const orgChain = createChainMock({
      data: { stripe_customer_id: 'cus_test_123' },
      error: null,
    });
    mockDb.from.mockReturnValue(orgChain);

    const req = createRequest('POST');
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('APP_URL not set');
  });
});
