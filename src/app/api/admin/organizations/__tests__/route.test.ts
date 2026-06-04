import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

const mockIsAdminEmail = vi.fn();
vi.mock('@/lib/admin', () => ({
  isAdminEmail: (...args: unknown[]) => mockIsAdminEmail(...args),
}));

const mockGetUser = vi.fn();
const mockServerClient = {
  auth: {
    getUser: mockGetUser,
  },
};
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockServerClient),
}));

const mockAdminFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({ from: mockAdminFrom }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/admin/organizations');
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

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
  chain.range = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../route');

describe('GET /api/admin/organizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

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

  // ── Organization list ─────────────────────────────────────────────────────

  it('should return organization list for admin user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@example.com' } },
      error: null,
    });
    mockIsAdminEmail.mockReturnValue(true);

    const orgsChain = createChainMock({
      data: [
        {
          id: 'org-1',
          name: 'Acme Corp',
          slug: 'acme-corp',
          plan: 'smb_growth',
          subscription_status: 'active',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      error: null,
      count: 1,
    });

    const entitiesChain = createChainMock({
      data: [{ id: 'entity-1', org_id: 'org-1' }],
      error: null,
    });

    const txCountChain = createChainMock({ data: null, error: null, count: 42 });
    const txLastChain = createChainMock({
      data: [{ created_at: '2025-06-01T12:00:00Z' }],
      error: null,
    });

    let txCallCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return orgsChain;
      if (table === 'entities') return entitiesChain;
      if (table === 'transactions') {
        txCallCount++;
        return txCallCount === 1 ? txCountChain : txLastChain;
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.organizations).toHaveLength(1);
    expect(json.organizations[0].name).toBe('Acme Corp');
    expect(json.organizations[0].entityCount).toBe(1);
    expect(json.organizations[0].transactionCount).toBe(42);
    expect(json.pagination).toBeDefined();
    expect(json.pagination.total).toBe(1);
  });

  // ── Empty orgs ────────────────────────────────────────────────────────────

  it('should handle empty organization list', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@example.com' } },
      error: null,
    });
    mockIsAdminEmail.mockReturnValue(true);

    const orgsChain = createChainMock({
      data: [],
      error: null,
      count: 0,
    });

    mockAdminFrom.mockReturnValue(orgsChain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.organizations).toHaveLength(0);
    expect(json.pagination.total).toBe(0);
    expect(json.pagination.hasMore).toBe(false);
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('should return 500 when database query fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@example.com' } },
      error: null,
    });
    mockIsAdminEmail.mockReturnValue(true);

    mockAdminFrom.mockImplementation(() => {
      throw new Error('Connection refused');
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch organizations');
  });
});
