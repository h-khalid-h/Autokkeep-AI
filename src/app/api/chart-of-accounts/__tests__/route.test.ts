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
  const url = new URL('http://localhost:3000/api/chart-of-accounts');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/chart-of-accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createPutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/chart-of-accounts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createDeleteRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/chart-of-accounts');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'DELETE' });
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

const { GET, POST, PUT, DELETE: DELETE_HANDLER } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('GET /api/chart-of-accounts', () => {
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

  it('should return accounts list', async () => {
    const accounts = [
      { id: 'acc-1', code: '1000', name: 'Cash', type: 'asset', is_active: true },
      { id: 'acc-2', code: '2000', name: 'AP', type: 'liability', is_active: true },
    ];
    const chain = createChainMock({ data: accounts, error: null });
    mockDb.from.mockReturnValue(chain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.accounts).toHaveLength(2);
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
    expect(json.accounts).toEqual([]);
  });
});

describe('POST /api/chart-of-accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 400 for missing required fields', async () => {
    const req = createPostRequest({ name: 'Cash' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 for invalid account type', async () => {
    const req = createPostRequest({ code: '1000', name: 'Cash', type: 'invalid' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should create account and return 201', async () => {
    const newAccount = { id: 'acc-new', code: '1000', name: 'Cash', type: 'asset', is_active: true };

    // Entity lookup chain (resolve default entity)
    const entityChain = createChainMock({
      data: [{ id: 'entity-1' }],
      error: null,
    });
    // Duplicate check chain (no duplicate)
    const dupCheckChain = createChainMock({ data: null, error: null });
    // Insert chain
    const insertChain = createChainMock({ data: newAccount, error: null });

    let coaCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'chart_of_accounts') {
        coaCallCount++;
        if (coaCallCount === 1) return dupCheckChain; // duplicate check
        return insertChain; // insert
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ code: '1000', name: 'Cash', type: 'asset' });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.account.code).toBe('1000');
  });
});

describe('PUT /api/chart-of-accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 400 when id is missing', async () => {
    const req = createPutRequest({ name: 'Updated' });
    const res = await PUT(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should update account and return 200', async () => {
    const validId = '7d374be6-d01d-4dc2-84a6-69bd10cb12fa';
    const updatedAccount = { id: validId, code: '1000', name: 'Updated Cash', type: 'asset' };

    // Existing account check
    const existingChain = createChainMock({
      data: { id: validId, entity_id: 'entity-1' },
      error: null,
    });
    // Update chain
    const updateChain = createChainMock({ data: updatedAccount, error: null });

    let coaCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'chart_of_accounts') {
        coaCallCount++;
        if (coaCallCount === 1) return existingChain; // find existing
        return updateChain; // update
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createPutRequest({ id: validId, name: 'Updated Cash' });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.account.name).toBe('Updated Cash');
  });
});

describe('DELETE /api/chart-of-accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 400 when id is missing', async () => {
    const req = createDeleteRequest();
    const res = await DELETE_HANDLER(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('id is required');
  });

  it('should soft-delete (deactivate) when transactions reference the account', async () => {
    // Existing account check
    const existingChain = createChainMock({
      data: { id: 'acc-1', entity_id: 'entity-1' },
      error: null,
    });
    // Code lookup
    const codeChain = createChainMock({
      data: { code: '1000' },
      error: null,
    });
    // Transaction reference count (has references)
    const refCountChain = createChainMock({ data: null, error: null, count: 5 });
    // Deactivate update chain
    const deactivateChain = createChainMock({ data: null, error: null });

    let coaCallCount = 0;
    let _txnCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'chart_of_accounts') {
        coaCallCount++;
        if (coaCallCount === 1) return existingChain; // find existing
        if (coaCallCount === 2) return codeChain; // get code
        return deactivateChain; // deactivate
      }
      if (table === 'transactions') {
        _txnCallCount++;
        return refCountChain;
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createDeleteRequest({ id: 'acc-1' });
    const res = await DELETE_HANDLER(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.soft_deleted).toBe(true);
    expect(json.success).toBe(true);
  });

  it('should hard-delete when no transactions reference the account', async () => {
    // Existing account check
    const existingChain = createChainMock({
      data: { id: 'acc-1', entity_id: 'entity-1' },
      error: null,
    });
    // Code lookup
    const codeChain = createChainMock({
      data: { code: '1000' },
      error: null,
    });
    // Transaction reference count (no references)
    const refCountChain = createChainMock({ data: null, error: null, count: 0 });
    // Delete chain
    const deleteChain = createChainMock({ data: null, error: null });

    let coaCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'chart_of_accounts') {
        coaCallCount++;
        if (coaCallCount === 1) return existingChain;
        if (coaCallCount === 2) return codeChain;
        return deleteChain;
      }
      if (table === 'transactions') return refCountChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createDeleteRequest({ id: 'acc-1' });
    const res = await DELETE_HANDLER(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.soft_deleted).toBeUndefined();
  });
});
