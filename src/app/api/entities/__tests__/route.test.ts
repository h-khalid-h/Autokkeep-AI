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

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/entities', {
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
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
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

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/entities
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/entities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ name: 'Test Entity', fiscalYearEnd: '12' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 when name is missing', async () => {
    const req = createPostRequest({ fiscalYearEnd: '12' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 when name is empty string', async () => {
    const req = createPostRequest({ name: '', fiscalYearEnd: '12' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 when fiscalYearEnd is invalid', async () => {
    const req = createPostRequest({ name: 'Test Entity', fiscalYearEnd: '13' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 409 when entity count limit (10) is reached', async () => {
    const countChain = createChainMock({ data: null, error: null, count: 10 });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return countChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ name: 'New Entity', fiscalYearEnd: '12' });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('Maximum of 10 entities');
  });

  it('should return 409 when entity name already exists in org', async () => {
    // First call: count check (under limit)
    const countChain = createChainMock({ data: null, error: null, count: 2 });
    // Second call: name uniqueness check (found duplicate)
    const dupChain = createChainMock({ data: [{ id: 'existing-id' }], error: null });

    let entityCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') {
        entityCallCount++;
        if (entityCallCount === 1) return countChain;
        return dupChain;
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ name: 'Existing Entity', fiscalYearEnd: '6' });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('already exists');
  });

  it('should return 500 when count check fails', async () => {
    const countChain = createChainMock({ data: null, error: { message: 'DB error' }, count: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return countChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ name: 'New Entity', fiscalYearEnd: '12' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to check entity limit');
  });

  it('should return 500 when insert fails', async () => {
    // Count check: under limit
    const countChain = createChainMock({ data: null, error: null, count: 1 });
    // Uniqueness check: no duplicate
    const dupChain = createChainMock({ data: [], error: null });
    // Insert: fails
    const insertChain = createChainMock({ data: null, error: { message: 'Insert failed' } });

    let entityCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') {
        entityCallCount++;
        if (entityCallCount === 1) return countChain;
        if (entityCallCount === 2) return dupChain;
        return insertChain;
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ name: 'New Entity', fiscalYearEnd: '12' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to create entity');
  });

  it('should create entity and return 201 on happy path', async () => {
    const newEntity = {
      id: 'a0000000-0000-4000-8000-000000000099',
      name: 'My New Entity',
      base_currency: 'USD',
    };

    // Count check: under limit
    const countChain = createChainMock({ data: null, error: null, count: 1 });
    // Uniqueness check: no duplicate
    const dupChain = createChainMock({ data: [], error: null });
    // Insert: success
    const insertChain = createChainMock({ data: newEntity, error: null });

    let entityCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') {
        entityCallCount++;
        if (entityCallCount === 1) return countChain;
        if (entityCallCount === 2) return dupChain;
        return insertChain;
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ name: 'My New Entity', fiscalYearEnd: '12' });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe('My New Entity');
    expect(json.id).toBe('a0000000-0000-4000-8000-000000000099');
  });

  it('should use default currency and fiscalYearEnd when not provided', async () => {
    const newEntity = {
      id: 'a0000000-0000-4000-8000-000000000099',
      name: 'Default Entity',
      base_currency: 'USD',
    };

    const countChain = createChainMock({ data: null, error: null, count: 0 });
    const dupChain = createChainMock({ data: [], error: null });
    const insertChain = createChainMock({ data: newEntity, error: null });

    let entityCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') {
        entityCallCount++;
        if (entityCallCount === 1) return countChain;
        if (entityCallCount === 2) return dupChain;
        return insertChain;
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ name: 'Default Entity' });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe('Default Entity');
  });
});
