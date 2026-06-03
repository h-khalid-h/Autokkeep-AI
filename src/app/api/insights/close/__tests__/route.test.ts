import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ai/close-engine', () => ({
  runMonthEndClose: vi.fn().mockResolvedValue({
    readinessScore: 95,
    checks: [{ name: 'bank_reconciled', passed: true }],
  }),
  closePeriod: vi.fn().mockResolvedValue({ success: true, message: 'Period closed successfully' }),
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

vi.mock('@/lib/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validation')>();
  return { ...actual };
});

// ─── Helpers ────────────────────────────────────────────────────────────────────

const ENTITY_ID = 'a0000000-0000-4000-8000-000000000010';

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/insights/close');
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/insights/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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

const { GET, POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');
const { runMonthEndClose, closePeriod } = await import('@/lib/ai/close-engine');

// ── GET Tests ─────────────────────────────────────────────────────────────────

describe('GET /api/insights/close', () => {
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

  it('should return 400 for invalid year', async () => {
    const req = createGetRequest({ entityId: ENTITY_ID, year: '1990', month: '6' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('year');
  });

  it('should return 400 for invalid month', async () => {
    const req = createGetRequest({ entityId: ENTITY_ID, year: '2026', month: '13' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('month');
  });

  it('should return 403 when entity not found', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: ENTITY_ID, year: '2026', month: '5' });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return report and period status on happy path', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID, org_id: 'a0000000-0000-4000-8000-000000000003' }, error: null });
    const periodChain = createChainMock({ data: { id: 'p-1', is_locked: false, locked_at: null, locked_by: null }, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'accounting_periods') return periodChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: ENTITY_ID, year: '2026', month: '5' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report).toBeDefined();
    expect(json.report.readinessScore).toBe(95);
    expect(json.periodStatus).toBeDefined();
    expect(json.periodStatus.isLocked).toBe(false);
  });
});

// ── POST Tests ────────────────────────────────────────────────────────────────

describe('POST /api/insights/close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ entityId: ENTITY_ID, year: 2026, month: 5, action: 'close' });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it('should return 400 for missing required fields', async () => {
    const req = createPostRequest({ entityId: ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 for invalid action', async () => {
    const req = createPostRequest({ entityId: ENTITY_ID, year: 2026, month: 5, action: 'open' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('should return 403 when entity not found', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createPostRequest({ entityId: ENTITY_ID, year: 2026, month: 5, action: 'close' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return 422 when readiness score is below 80', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID, org_id: 'a0000000-0000-4000-8000-000000000003' }, error: null });
    mockDb.from.mockReturnValue(entityChain);

    (runMonthEndClose as ReturnType<typeof vi.fn>).mockResolvedValue({
      readinessScore: 60,
      checks: [{ name: 'bank_reconciled', passed: false }],
    });

    const req = createPostRequest({ entityId: ENTITY_ID, year: 2026, month: 5, action: 'close' });
    const res = await POST(req);

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe('Period is not ready to close');
    expect(json.report).toBeDefined();
  });

  it('should return 409 when closePeriod fails', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID, org_id: 'a0000000-0000-4000-8000-000000000003' }, error: null });
    mockDb.from.mockReturnValue(entityChain);

    (runMonthEndClose as ReturnType<typeof vi.fn>).mockResolvedValue({
      readinessScore: 95,
      checks: [{ name: 'bank_reconciled', passed: true }],
    });
    (closePeriod as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      message: 'Period already locked',
    });

    const req = createPostRequest({ entityId: ENTITY_ID, year: 2026, month: 5, action: 'close' });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Period already locked');
  });

  it('should close period successfully on happy path', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID, org_id: 'a0000000-0000-4000-8000-000000000003' }, error: null });
    mockDb.from.mockReturnValue(entityChain);

    (runMonthEndClose as ReturnType<typeof vi.fn>).mockResolvedValue({
      readinessScore: 95,
      checks: [{ name: 'bank_reconciled', passed: true }],
    });
    (closePeriod as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      message: 'Period closed successfully',
    });

    const req = createPostRequest({ entityId: ENTITY_ID, year: 2026, month: 5, action: 'close' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toBe('Period closed successfully');
    expect(json.report).toBeDefined();
  });
});
