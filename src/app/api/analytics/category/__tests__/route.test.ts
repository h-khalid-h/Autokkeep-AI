import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
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

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/analytics/category');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('GET /api/analytics/category', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('should return 400 if entityId is missing', async () => {
    const req = createGetRequest({ category: '6200-meals' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('entityId');
  });

  it('should return 400 if category is missing', async () => {
    const req = createGetRequest({ entityId: 'entity-1' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('category');
  });

  // ── Happy Path ──────────────────────────────────────────────────────────────

  it('should return transactions, vendor breakdown, and monthly trend', async () => {
    const transactions = [
      { id: 'tx-1', date: '2025-01-15', merchant_name: 'Starbucks', amount: 12.50, status: 'approved' },
      { id: 'tx-2', date: '2025-01-20', merchant_name: 'Uber Eats', amount: 30.00, status: 'approved' },
      { id: 'tx-3', date: '2025-02-05', merchant_name: 'Starbucks', amount: 15.00, status: 'auto_categorized' },
    ];

    const entityChain = createChainMock({
      data: { id: 'entity-1', org_id: 'org-1' },
      error: null,
    });
    const coaChain = createChainMock({
      data: [{ name: 'Meals & Entertainment' }],
      error: null,
    });
    const txChain = createChainMock({
      data: transactions,
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'chart_of_accounts') return coaChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null });
    });

    const req = createGetRequest({
      entityId: 'entity-1',
      category: '6200-meals',
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    // Category metadata
    expect(json.category).toBe('6200-meals');
    expect(json.categoryName).toBe('Meals & Entertainment');

    // Transaction count and total
    expect(json.transactionCount).toBe(3);
    expect(json.totalAmount).toBe(57.50);
    expect(json.transactions).toHaveLength(3);

    // Vendor breakdown sorted by total desc
    expect(json.vendorBreakdown).toHaveLength(2);
    expect(json.vendorBreakdown[0].vendor).toBe('Uber Eats');
    expect(json.vendorBreakdown[0].count).toBe(1);
    expect(json.vendorBreakdown[0].total).toBe(30.00);
    expect(json.vendorBreakdown[1].vendor).toBe('Starbucks');
    expect(json.vendorBreakdown[1].count).toBe(2);
    expect(json.vendorBreakdown[1].total).toBe(27.50);

    // Monthly trend sorted chronologically
    expect(json.monthlyTrend).toHaveLength(2);
    expect(json.monthlyTrend[0].month).toBe('2025-01');
    expect(json.monthlyTrend[0].total).toBe(42.50);
    expect(json.monthlyTrend[1].month).toBe('2025-02');
    expect(json.monthlyTrend[1].total).toBe(15.00);
  });

  // ── Empty Results ─────────────────────────────────────────────────────────

  it('should return zero totals for empty results', async () => {
    const entityChain = createChainMock({
      data: { id: 'entity-1', org_id: 'org-1' },
      error: null,
    });
    const coaChain = createChainMock({
      data: [],
      error: null,
    });
    const txChain = createChainMock({
      data: [],
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'chart_of_accounts') return coaChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null });
    });

    const req = createGetRequest({
      entityId: 'entity-1',
      category: '9999-nonexistent',
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.totalAmount).toBe(0);
    expect(json.transactionCount).toBe(0);
    expect(json.transactions).toEqual([]);
    expect(json.vendorBreakdown).toEqual([]);
    expect(json.monthlyTrend).toEqual([]);
    // Category name falls back to the code when not in chart_of_accounts
    expect(json.categoryName).toBe('9999-nonexistent');
  });
});
