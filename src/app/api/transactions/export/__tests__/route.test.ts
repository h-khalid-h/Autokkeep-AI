import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock getApiAuthContext
const mockDb = { from: vi.fn() };

const mockAuthContext = {
  user: { id: 'a0000000-0000-4000-8000-000000000001', email: 'user@example.com' },
  membership: { id: 'a0000000-0000-4000-8000-000000000002', org_id: 'a0000000-0000-4000-8000-000000000003', role: 'owner' },
  db: mockDb,
  entityIds: ['a0000000-0000-4000-8000-000000000010'],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/transactions/export');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
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
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
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
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('GET /api/transactions/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 when entityId is missing', async () => {
    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('entityId is required');
  });

  it('should return 403 when entity not found or access denied', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return JSON when format=json', async () => {
    const txns = [
      { id: 'tx-1', date: '2025-01-01', merchant_name: 'Acme', amount: 50, currency: 'USD', status: 'approved' },
      { id: 'tx-2', date: '2025-01-02', merchant_name: 'Globex', amount: 100, currency: 'USD', status: 'pending' },
    ];

    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003' },
      error: null,
    });

    const txChain = createChainMock({ data: txns, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000010', format: 'json' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].merchant_name).toBe('Acme');
  });

  it('should return CSV by default with proper headers', async () => {
    const txns = [
      {
        id: 'tx-1',
        date: '2025-01-01',
        merchant_name: 'Acme Corp',
        amount: 50.00,
        currency: 'USD',
        category_ai: '6000 - Office',
        status: 'approved',
        confidence: 0.95,
        ai_reasoning: 'Office supply purchase',
      },
    ];

    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003' },
      error: null,
    });

    const txChain = createChainMock({ data: txns, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename=autokkeep-transactions-');

    const csv = await res.text();
    expect(csv).toContain('Date,Merchant,Amount,Currency,Category (GL Code),Status,AI Confidence,AI Reasoning');
    expect(csv).toContain('Acme Corp');
    expect(csv).toContain('50');
  });

  it('should return empty CSV when no transactions found', async () => {
    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003' },
      error: null,
    });

    const txChain = createChainMock({ data: [], error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const csv = await res.text();
    // Should only contain the header row
    const lines = csv.split('\n').filter((l: string) => l.trim() !== '');
    expect(lines).toHaveLength(1);
  });

  it('should return 500 when query fails', async () => {
    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003' },
      error: null,
    });

    const txChain = createChainMock({ data: null, error: { message: 'DB error' } });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch transactions');
  });
});
