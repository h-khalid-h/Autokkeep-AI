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

// Mock audit
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
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
  const url = new URL('http://localhost:3000/api/transactions');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET, POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('GET /api/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

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

  it('should return transactions list', async () => {
    const txns = [
      { id: 'tx-1', merchant_name: 'Test', amount: 100, date: '2025-01-01' },
      { id: 'tx-2', merchant_name: 'Test2', amount: 200, date: '2025-01-02' },
    ];
    const txnChain = createChainMock({ data: txns, error: null, count: 2 });
    mockDb.from.mockReturnValue(txnChain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.transactions).toHaveLength(2);
    expect(json.pagination.total).toBe(2);
  });

  it('should return empty list when no entities', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockAuthContext,
      entityIds: [],
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.transactions).toEqual([]);
    expect(json.pagination.total).toBe(0);
  });
});

describe('POST /api/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ entityId: 'entity-1', merchant: 'Test', amount: 100, date: '2025-01-01' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 for missing required fields', async () => {
    const req = createPostRequest({ merchant: 'Test' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('required');
  });

  it('should return 400 for invalid amount', async () => {
    const req = createPostRequest({
      entityId: 'entity-1',
      merchant: 'Test',
      amount: 'not-a-number',
      date: '2025-01-01',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('amount');
  });

  it('should create transaction and return 201', async () => {
    const newTxn = { id: 'tx-new', merchant_name: 'Test', amount: 99.99, date: '2025-01-01' };

    // Entity validation chain
    const entityChain = createChainMock({
      data: { id: 'entity-1', org_id: 'org-1' },
      error: null,
    });
    // Transaction insert chain
    const insertChain = createChainMock({
      data: newTxn,
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return insertChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({
      entityId: 'entity-1',
      merchant: 'Test',
      amount: 99.99,
      date: '2025-01-01',
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.transaction.id).toBe('tx-new');
  });
});
