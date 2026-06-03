import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock Sentry
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

// Mock audit (in case it's pulled in transitively)
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock admin check
const mockIsAdminEmail = vi.fn();
vi.mock('@/lib/admin', () => ({
  isAdminEmail: (...args: unknown[]) => mockIsAdminEmail(...args),
}));

// Mock Supabase server client (for auth)
const mockGetUser = vi.fn();
const mockServerClient = {
  auth: {
    getUser: mockGetUser,
  },
};
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockServerClient),
}));

// Mock Supabase admin client (for cross-org queries)
const mockAdminFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({ from: mockAdminFrom }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createGetRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/stats', { method: 'GET' });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../route');

describe('GET /api/admin/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 403 when user is not admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'regular@example.com' } },
      error: null,
    });
    mockIsAdminEmail.mockReturnValue(false);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });

  it('should return full stats for admin user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@example.com' } },
      error: null,
    });
    mockIsAdminEmail.mockReturnValue(true);

    // Set up admin from mock — each call to from() returns a chain
    // The route makes 12 parallel queries via Promise.all
    const orgsChain = createChainMock({ data: null, error: null, count: 10 });
    const entitiesChain = createChainMock({ data: null, error: null, count: 25 });
    const txTotalChain = createChainMock({ data: null, error: null, count: 500 });
    const txPendingChain = createChainMock({ data: null, error: null, count: 50 });
    const txApprovedChain = createChainMock({ data: null, error: null, count: 200 });
    const txAutoChain = createChainMock({ data: null, error: null, count: 100 });
    const txHumanChain = createChainMock({ data: null, error: null, count: 30 });
    const txSyncedChain = createChainMock({ data: null, error: null, count: 120 });
    const txTodayChain = createChainMock({ data: null, error: null, count: 15 });
    const txWeekChain = createChainMock({ data: null, error: null, count: 80 });
    const txMonthChain = createChainMock({ data: null, error: null, count: 300 });
    const subsChain = createChainMock({
      data: [
        { plan: 'starter', status: 'active' },
        { plan: 'starter', status: 'active' },
        { plan: 'smb_growth', status: 'active' },
      ],
      error: null,
    });

    let txnCallCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return orgsChain;
      if (table === 'entities') return entitiesChain;
      if (table === 'subscriptions') return subsChain;
      if (table === 'transactions') {
        txnCallCount++;
        // Order matches Promise.all in the route:
        // 1: total, 2: pending, 3: approved, 4: auto, 5: human, 6: synced, 7: today, 8: week, 9: month
        switch (txnCallCount) {
          case 1: return txTotalChain;
          case 2: return txPendingChain;
          case 3: return txApprovedChain;
          case 4: return txAutoChain;
          case 5: return txHumanChain;
          case 6: return txSyncedChain;
          case 7: return txTodayChain;
          case 8: return txWeekChain;
          case 9: return txMonthChain;
          default: return createChainMock({ data: null, error: null, count: 0 });
        }
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    // Verify structure
    expect(json.organizations).toBe(10);
    expect(json.entities).toBe(25);
    expect(json.transactions.total).toBe(500);
    expect(json.transactions.byStatus.pending).toBe(50);
    expect(json.transactions.byStatus.approved).toBe(200);
    expect(json.transactions.byStatus.auto_categorized).toBe(100);
    expect(json.transactions.byStatus.human_review).toBe(30);
    expect(json.transactions.byStatus.synced).toBe(120);
    expect(json.transactions.today).toBe(15);
    expect(json.transactions.thisWeek).toBe(80);
    expect(json.transactions.thisMonth).toBe(300);

    // Verify subscription breakdown
    expect(json.subscriptions.byPlan.starter).toBe(2);
    expect(json.subscriptions.byPlan.smb_growth).toBe(1);
    // Revenue: 2*29 + 1*99 = 157
    expect(json.subscriptions.monthlyRevenue).toBe(157);
  });

  it('should return 500 when database query throws', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@example.com' } },
      error: null,
    });
    mockIsAdminEmail.mockReturnValue(true);

    // Make adminFrom throw
    mockAdminFrom.mockImplementation(() => {
      throw new Error('DB connection failed');
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch admin stats');
  });
});
