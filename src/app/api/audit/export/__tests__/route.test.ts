import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

const mockRateLimit = vi.fn().mockResolvedValue(null);
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
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
  const url = new URL('http://localhost:3000/api/audit/export');
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
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split('\n')
    .map((line) => line.split(',').map((f) => f.replace(/^"|"$/g, '')));
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('GET /api/audit/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
    mockRateLimit.mockResolvedValue(null);
  });

  // ── CSV Headers ─────────────────────────────────────────────────────────────

  it('should return CSV with correct headers', async () => {
    const logs = [
      {
        actor_id: 'user-1',
        action: 'create',
        target_type: 'transaction',
        entity_id: 'entity-1',
        details: { amount: 100 },
        created_at: '2025-06-01T10:00:00Z',
      },
    ];

    const chain = createChainMock({ data: logs, error: null });
    mockDb.from.mockReturnValue(chain);

    const req = createGetRequest({ entityId: 'entity-1' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('audit_log.csv');

    const text = await res.text();
    const rows = parseCsv(text);

    // Header row
    expect(rows[0]).toEqual(['Date', 'User', 'Action', 'Entity Type', 'Entity ID', 'Details']);

    // Data row
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe('user-1');
    expect(rows[1][2]).toBe('create');
    expect(rows[1][3]).toBe('transaction');
    expect(rows[1][4]).toBe('entity-1');
  });

  // ── Date filtering ──────────────────────────────────────────────────────────

  it('should filter by date range', async () => {
    const logs = [
      {
        actor_id: 'user-1',
        action: 'update',
        target_type: 'chart_of_accounts',
        entity_id: 'entity-1',
        details: null,
        created_at: '2025-03-15T12:00:00Z',
      },
    ];

    const entityChain = createChainMock({
      data: { id: 'entity-1', org_id: 'org-1' },
      error: null,
    });
    const auditChain = createChainMock({ data: logs, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'audit_log') return auditChain;
      return createChainMock({ data: null });
    });

    const req = createGetRequest({
      entityId: 'entity-1',
      startDate: '2025-03-01',
      endDate: '2025-03-31',
    });
    const res = await GET(req);

    expect(res.status).toBe(200);

    // Verify gte/lte were called on the audit chain
    expect(auditChain.gte).toHaveBeenCalledWith('created_at', '2025-03-01');
    expect(auditChain.lte).toHaveBeenCalledWith('created_at', '2025-03-31T23:59:59.999Z');

    const text = await res.text();
    const rows = parseCsv(text);
    expect(rows).toHaveLength(2); // header + 1 data row
  });

  // ── Empty audit log ─────────────────────────────────────────────────────────

  it('should return header-only CSV for empty audit log', async () => {
    const chain = createChainMock({ data: [], error: null });
    mockDb.from.mockReturnValue(chain);

    const req = createGetRequest({ entityId: 'entity-1' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const text = await res.text();
    const rows = parseCsv(text);

    // Only the header row
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(['Date', 'User', 'Action', 'Entity Type', 'Entity ID', 'Details']);
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it('should return 429 when rate limited', async () => {
    mockRateLimit.mockResolvedValue(
      NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    );

    const req = createGetRequest({ entityId: 'entity-1' });
    const res = await GET(req);

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain('Too many requests');
  });

  // ── No entities ─────────────────────────────────────────────────────────────

  it('should return header-only CSV when user has no entities', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockAuthContext,
      entityIds: [],
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');

    const text = await res.text();
    const rows = parseCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(['Date', 'User', 'Action', 'Entity Type', 'Entity ID', 'Details']);
  });
});
