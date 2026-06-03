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
  const url = new URL('http://localhost:3000/api/audit');
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
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('GET /api/audit', () => {
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

  // ── Happy Path ────────────────────────────────────────────────────────────

  it('should return audit logs with pagination', async () => {
    const logs = [
      { id: 'log-1', action: 'create', target_type: 'transaction', created_at: '2025-01-01T00:00:00Z' },
      { id: 'log-2', action: 'update', target_type: 'chart_of_accounts', created_at: '2025-01-02T00:00:00Z' },
    ];
    const chain = createChainMock({ data: logs, error: null, count: 2 });
    mockDb.from.mockReturnValue(chain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.auditLogs).toHaveLength(2);
    expect(json.pagination.total).toBe(2);
    expect(json.pagination.hasMore).toBe(false);
  });

  // ── Entity filter ─────────────────────────────────────────────────────────

  it('should return 403 when entityId is invalid', async () => {
    // Entity validation fails
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: 'bad-entity' });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('Entity not found');
  });

  it('should filter audit logs by entityId', async () => {
    const logs = [
      { id: 'log-1', entity_id: 'entity-1', action: 'create' },
    ];

    // Entity validation succeeds
    const entityChain = createChainMock({
      data: { id: 'entity-1', org_id: 'org-1' },
      error: null,
    });
    // Audit log query
    const auditChain = createChainMock({ data: logs, error: null, count: 1 });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'audit_log') return auditChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: 'entity-1' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.auditLogs).toHaveLength(1);
    expect(json.pagination.total).toBe(1);
  });

  // ── No entities ───────────────────────────────────────────────────────────

  it('should return empty list when no entities', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockAuthContext,
      entityIds: [],
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.auditLogs).toEqual([]);
    expect(json.pagination.total).toBe(0);
  });
});
