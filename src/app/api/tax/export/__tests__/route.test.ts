import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
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

const ENTITY_ID = 'entity-1';

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/tax/export');
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('GET /api/tax/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest({ entityId: ENTITY_ID, year: '2025' });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── Param validation ──────────────────────────────────────────────────────

  it('should return 400 when entityId missing', async () => {
    const req = createGetRequest({ year: '2025' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('entityId');
  });

  it('should return 400 for year below 2000', async () => {
    const req = createGetRequest({ entityId: ENTITY_ID, year: '1999' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('year');
  });

  it('should return 400 for year above 2100', async () => {
    const req = createGetRequest({ entityId: ENTITY_ID, year: '2101' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('year');
  });

  it('should return 400 for non-numeric year', async () => {
    const req = createGetRequest({ entityId: ENTITY_ID, year: 'abc' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('year');
  });

  // ── Entity access ─────────────────────────────────────────────────────────

  it('should return 403 when entity not found or access denied', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: ENTITY_ID, year: '2025' });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  // ── CSV generation ────────────────────────────────────────────────────────

  it('should generate CSV export on happy path', async () => {
    const entityChain = createChainMock({
      data: { id: ENTITY_ID, org_id: 'org-1', name: 'Test Entity' },
      error: null,
    });
    const txChain = createChainMock({
      data: [
        {
          date: '2025-03-15',
          merchant_name: 'Office Depot',
          amount: 250.00,
          category_human: '5100',
          category_ai: null,
          gl_name: 'Office Supplies',
          document_status: 'found',
        },
        {
          date: '2025-04-20',
          merchant_name: 'AWS',
          amount: 1200.50,
          category_human: null,
          category_ai: '6000',
          gl_name: 'Cloud Hosting',
          document_status: 'missing',
        },
      ],
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: ENTITY_ID, year: '2025' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('autokkeep-tax-export-2025.csv');

    const csv = await res.text();
    expect(csv).toContain('Date,Merchant,Amount,Category (GL Code),GL Name,Deductible,Receipt');
    expect(csv).toContain('Office Depot');
    expect(csv).toContain('250.00');
    expect(csv).toContain('SUMMARY BY CATEGORY');
  });

  // ── Empty data ────────────────────────────────────────────────────────────

  it('should handle empty transaction data', async () => {
    const entityChain = createChainMock({
      data: { id: ENTITY_ID, org_id: 'org-1', name: 'Test Entity' },
      error: null,
    });
    const txChain = createChainMock({ data: [], error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: ENTITY_ID, year: '2025' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const csv = await res.text();
    // Should still have header row and summary section
    expect(csv).toContain('Date,Merchant,Amount');
    expect(csv).toContain('SUMMARY BY CATEGORY');
    expect(csv).toContain('TOTAL,,0.00,0');
  });

  // ── Default year ──────────────────────────────────────────────────────────

  it('should default to current year when year not provided', async () => {
    const entityChain = createChainMock({
      data: { id: ENTITY_ID, org_id: 'org-1', name: 'Test Entity' },
      error: null,
    });
    const txChain = createChainMock({ data: [], error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const currentYear = new Date().getFullYear();
    expect(res.headers.get('Content-Disposition')).toContain(`autokkeep-tax-export-${currentYear}.csv`);
  });
});
