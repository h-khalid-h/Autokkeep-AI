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

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/dashboard/stats');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

/** Fluent chain builder for Supabase query mocks — supports both count and data queries */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
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

describe('GET /api/dashboard/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── No data ───────────────────────────────────────────────────────────────

  it('should handle no entities gracefully', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockAuthContext,
      entityIds: [],
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalTransactions).toBe(0);
    expect(json.pendingReview).toBe(0);
    expect(json.topCategories).toEqual([]);
    expect(json.recentActivity).toEqual([]);
  });

  // ── Happy Path ────────────────────────────────────────────────────────────

  it('should return stats for entity', async () => {
    // The dashboard stats route calls db.from('transactions') many times via Promise.all,
    // plus additional queries for monthly volume, top categories, and recent activity.
    // We return a chain that supports both count queries and data queries.
    const statsChain = createChainMock({ data: [], error: null, count: 10 });
    mockDb.from.mockReturnValue(statsChain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.totalTransactions).toBe('number');
    expect(typeof json.pendingReview).toBe('number');
    expect(typeof json.autoApproved).toBe('number');
    expect(typeof json.synced).toBe('number');
    expect(typeof json.aiAccuracy).toBe('number');
    expect(typeof json.monthlyVolume).toBe('number');
    expect(Array.isArray(json.topCategories)).toBe(true);
    expect(Array.isArray(json.recentActivity)).toBe(true);
  });

  it('should validate entity access when entityId is provided', async () => {
    // Entity validation fails
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: 'bad-entity' });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('Entity not found');
  });
});
