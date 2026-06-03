import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

const mockNarrative = {
  summary: 'Revenue increased 15% MoM',
  highlights: ['Strong growth'],
  concerns: [],
  generatedAt: '2026-05-01T00:00:00.000Z',
};

vi.mock('@/lib/ai/narrative', () => ({
  generateMonthlyNarrative: vi.fn().mockResolvedValue(mockNarrative),
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
  const url = new URL('http://localhost:3000/api/insights/narrative');
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/insights/narrative', {
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
const { generateMonthlyNarrative } = await import('@/lib/ai/narrative');

// ── GET Tests ─────────────────────────────────────────────────────────────────

describe('GET /api/insights/narrative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest({ entityId: ENTITY_ID, year: '2026', month: '5' });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 when entityId missing', async () => {
    const req = createGetRequest({ year: '2026', month: '5' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('entityId');
  });

  it('should return 400 when year/month missing', async () => {
    const req = createGetRequest({ entityId: ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('year');
  });

  it('should return 400 for invalid year out of range', async () => {
    const req = createGetRequest({ entityId: ENTITY_ID, year: '1990', month: '5' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('year');
  });

  it('should return 400 for invalid month', async () => {
    const req = createGetRequest({ entityId: ENTITY_ID, year: '2026', month: '0' });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('year');
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

  it('should return cached narrative when available', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID }, error: null });
    const narrativeChain = createChainMock({
      data: {
        narrative_data: { summary: 'Cached narrative' },
        generated_at: '2026-05-01T00:00:00.000Z',
      },
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'financial_narratives') return narrativeChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: ENTITY_ID, year: '2026', month: '5' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(true);
    expect(json.narrative.summary).toBe('Cached narrative');
    expect(generateMonthlyNarrative).not.toHaveBeenCalled();
  });

  it('should generate narrative when no cache exists', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID }, error: null });
    const narrativeChain = createChainMock({ data: null, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'financial_narratives') return narrativeChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: ENTITY_ID, year: '2026', month: '5' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(false);
    expect(json.narrative).toBeDefined();
    expect(generateMonthlyNarrative).toHaveBeenCalledWith(ENTITY_ID, 2026, 5, mockDb);
  });
});

// ── POST Tests ────────────────────────────────────────────────────────────────

describe('POST /api/insights/narrative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ entityId: ENTITY_ID, year: 2026, month: 5 });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it('should return 400 for missing fields', async () => {
    const req = createPostRequest({ entityId: ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 for invalid entityId', async () => {
    const req = createPostRequest({ entityId: 'not-a-uuid', year: 2026, month: 5 });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('should return 403 when entity not found', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createPostRequest({ entityId: ENTITY_ID, year: 2026, month: 5 });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should force regenerate narrative on happy path', async () => {
    const entityChain = createChainMock({ data: { id: ENTITY_ID }, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createPostRequest({ entityId: ENTITY_ID, year: 2026, month: 5 });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(false);
    expect(json.narrative).toBeDefined();
    expect(generateMonthlyNarrative).toHaveBeenCalledWith(ENTITY_ID, 2026, 5, mockDb);
  });
});
