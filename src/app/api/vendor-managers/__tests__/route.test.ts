import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/validation', () => ({
  parseBody: vi.fn(),
  schemas: { createVendorManager: {} },
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
  const url = new URL('http://localhost:3000/api/vendor-managers');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/vendor-managers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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

const { GET, POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');
const { parseBody } = await import('@/lib/validation');

// ─── GET Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/vendor-managers', () => {
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

  it('should return empty list when user has no entities', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockAuthContext,
      entityIds: [],
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vendorManagers).toEqual([]);
  });

  it('should return vendor managers list (happy path)', async () => {
    const vendorManagers = [
      {
        id: 'a0000000-0000-4000-8000-000000000020',
        entity_id: 'a0000000-0000-4000-8000-000000000010',
        vendor_pattern: 'Acme*',
        manager_user_id: 'a0000000-0000-4000-8000-000000000001',
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    const chain = createChainMock({ data: vendorManagers, error: null });
    mockDb.from.mockReturnValue(chain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vendorManagers).toHaveLength(1);
    expect(json.vendorManagers[0].vendor_pattern).toBe('Acme*');
  });

  it('should return 500 on database error', async () => {
    const chain = createChainMock({ data: null, error: { message: 'DB error' } });
    mockDb.from.mockReturnValue(chain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch vendor managers');
  });
});

// ─── POST Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/vendor-managers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({
      entityId: 'a0000000-0000-4000-8000-000000000010',
      vendorPattern: 'Acme*',
      managerUserId: 'a0000000-0000-4000-8000-000000000001',
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 for invalid body (validation failure)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: NextResponse.json(
        { error: 'Validation failed', details: [{ field: 'vendorPattern', message: 'Required' }] },
        { status: 400 },
      ),
    });

    const req = createPostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('should return 403 when entity is not accessible', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        entityId: 'a0000000-0000-4000-8000-000000000099',
        vendorPattern: 'Acme*',
        managerUserId: 'a0000000-0000-4000-8000-000000000001',
      },
    });

    const req = createPostRequest({
      entityId: 'a0000000-0000-4000-8000-000000000099',
      vendorPattern: 'Acme*',
      managerUserId: 'a0000000-0000-4000-8000-000000000001',
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return 400 when manager user is not in the org', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        entityId: 'a0000000-0000-4000-8000-000000000010',
        vendorPattern: 'Acme*',
        managerUserId: 'a0000000-0000-4000-8000-000000000077',
      },
    });

    // team_members check returns empty
    const memberChain = createChainMock({ data: [], error: null });
    mockDb.from.mockReturnValue(memberChain);

    const req = createPostRequest({
      entityId: 'a0000000-0000-4000-8000-000000000010',
      vendorPattern: 'Acme*',
      managerUserId: 'a0000000-0000-4000-8000-000000000077',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Manager user is not a member of this organization');
  });

  it('should create vendor manager and return 201 (happy path)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        entityId: 'a0000000-0000-4000-8000-000000000010',
        vendorPattern: 'Acme*',
        managerUserId: 'a0000000-0000-4000-8000-000000000001',
      },
    });

    // team_members check returns valid member
    const memberChain = createChainMock({ data: [{ user_id: 'a0000000-0000-4000-8000-000000000001' }], error: null });

    const newVm = {
      id: 'a0000000-0000-4000-8000-000000000020',
      entity_id: 'a0000000-0000-4000-8000-000000000010',
      vendor_pattern: 'Acme*',
      manager_user_id: 'a0000000-0000-4000-8000-000000000001',
    };
    const insertChain = createChainMock({ data: newVm, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'team_members') return memberChain;
      if (table === 'vendor_managers') return insertChain;
      // audit_logs
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({
      entityId: 'a0000000-0000-4000-8000-000000000010',
      vendorPattern: 'Acme*',
      managerUserId: 'a0000000-0000-4000-8000-000000000001',
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.vendorManager).toBeDefined();
    expect(json.vendorManager.vendor_pattern).toBe('Acme*');
  });
});
