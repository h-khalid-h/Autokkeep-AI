import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock audit log — F15/F24 added audit logging to tax readiness
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockReport = {
  score: 85,
  readinessScore: 85,
  category: 'Ready',
  issues: [],
  recommendations: ['Review depreciation schedules'],
  totalExpenses: 10000,
  totalDeductible: 7500,
  estimatedSavings: 1875,
  deductionsByCategory: [
    { category: 'Office Supplies', amount: 3000, count: 15 },
    { category: 'Software', amount: 4500, count: 8 },
  ],
  missingReceipts: [],
};

vi.mock('@/lib/tax/readiness', () => ({
  analyzeTaxReadiness: vi.fn().mockResolvedValue(mockReport),
}));

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

const ENTITY_ID = 'a0000000-0000-4000-8000-000000000010';

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/tax/readiness');
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
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
const { analyzeTaxReadiness } = await import('@/lib/tax/readiness');

describe('GET /api/tax/readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest({ entityId: ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 when entityId missing', async () => {
    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('entityId');
  });

  it('should return 400 for invalid taxYear (too low)', async () => {
    const req = createGetRequest({ entityId: ENTITY_ID, taxYear: '1999' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('taxYear');
  });

  it('should return 400 for invalid taxYear (too high)', async () => {
    const req = createGetRequest({ entityId: ENTITY_ID, taxYear: '2101' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('taxYear');
  });

  it('should return 400 for non-numeric taxYear', async () => {
    const req = createGetRequest({ entityId: ENTITY_ID, taxYear: 'abc' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('taxYear');
  });

  it('should return 403 when entity not found or access denied', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: ENTITY_ID, taxYear: '2026' });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return tax readiness report on happy path', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID, org_id: 'a0000000-0000-4000-8000-000000000003' }, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: ENTITY_ID, taxYear: '2026' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report).toBeDefined();
    expect(json.report.score).toBe(85);
    expect(analyzeTaxReadiness).toHaveBeenCalledWith(ENTITY_ID, 2026, mockDb);
  });

  it('should default to current year when taxYear not provided', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID, org_id: 'a0000000-0000-4000-8000-000000000003' }, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(analyzeTaxReadiness).toHaveBeenCalledWith(
      ENTITY_ID,
      new Date().getFullYear(),
      mockDb,
    );
  });
});
