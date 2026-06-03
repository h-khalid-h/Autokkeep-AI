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

// Mock audit log
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock validation — pass-through by default (overridden per test)
vi.mock('@/lib/validation', () => ({
  parseBody: vi.fn(),
  schemas: { createVendor: {} },
}));

// Mock vendor service
vi.mock('@/lib/vendors/service', () => ({
  normalizeMerchantName: vi.fn((name: string) => name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()),
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

function createGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/vendors');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), { method: 'GET' });
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/vendors', {
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
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
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

// ─── GET /api/vendors ───────────────────────────────────────────────────────────

describe('GET /api/vendors', () => {
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
    const req = createGetRequest({}); // No entityId
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('entityId');
  });

  it('should return 403 when entity is not in authorized list', async () => {
    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('access denied');
  });

  it('should return vendor list with valid entityId', async () => {
    const vendorData = [
      { id: 'v-001', name: 'Acme Corp', normalized_name: 'acme corp', vendor_type: 'supplier', is_active: true },
      { id: 'v-002', name: 'Globex Inc', normalized_name: 'globex inc', vendor_type: 'contractor', is_active: true },
    ];

    const vendorChain = createChainMock({ data: vendorData, error: null, count: 2 });
    mockDb.from.mockReturnValue(vendorChain);

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vendors).toHaveLength(2);
    expect(json.vendors[0].name).toBe('Acme Corp');
    expect(json.pagination).toBeDefined();
    expect(json.pagination.total).toBe(2);
  });

  it('should return empty vendor list when no vendors exist', async () => {
    const vendorChain = createChainMock({ data: [], error: null, count: 0 });
    mockDb.from.mockReturnValue(vendorChain);

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vendors).toHaveLength(0);
    expect(json.pagination.total).toBe(0);
  });

  it('should return 500 when database query fails', async () => {
    const vendorChain = createChainMock({ data: null, error: { message: 'DB error' }, count: null });
    mockDb.from.mockReturnValue(vendorChain);

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Failed to fetch vendors');
  });
});

// ─── POST /api/vendors ──────────────────────────────────────────────────────────

describe('POST /api/vendors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010', name: 'Test Vendor' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 for validation failure', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: NextResponse.json(
        { error: 'Validation failed', details: [{ field: 'name', message: 'Required' }] },
        { status: 400 },
      ),
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('should return 403 when entity is not in authorized list', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { entityId: 'a0000000-0000-4000-8000-000000000099', name: 'Test Vendor' },
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000099', name: 'Test Vendor' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('access denied');
  });

  it('should create a vendor with normalized name and return 201', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        entityId: 'a0000000-0000-4000-8000-000000000010',
        name: 'Acme Corp LLC',
        vendorType: 'contractor',
      },
    });

    // Dedup check — no existing vendor
    const dedupeChain = createChainMock({ data: [], error: null });
    // Create chain — returns created vendor
    const createdVendor = {
      id: 'v-new-001',
      entity_id: 'a0000000-0000-4000-8000-000000000010',
      name: 'Acme Corp LLC',
      normalized_name: 'acme corp llc',
      vendor_type: 'contractor',
      w9_status: 'not_collected',
      is_active: true,
    };
    const insertChain = createChainMock({ data: createdVendor, error: null });

    let fromCallCount = 0;
    mockDb.from.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) return dedupeChain; // First: dedup check
      return insertChain;                          // Second: insert
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010', name: 'Acme Corp LLC' });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.vendor).toBeDefined();
    expect(json.vendor.name).toBe('Acme Corp LLC');
    expect(json.vendor.id).toBe('v-new-001');
  });

  it('should return 409 for duplicate vendor', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        entityId: 'a0000000-0000-4000-8000-000000000010',
        name: 'Acme Corp',
      },
    });

    // Dedup check — existing vendor found
    const dedupeChain = createChainMock({
      data: [{ id: 'v-existing', name: 'Acme Corp' }],
      error: null,
    });

    mockDb.from.mockReturnValue(dedupeChain);

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010', name: 'Acme Corp' });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('similar name already exists');
    expect(json.error).toContain('Acme Corp');
  });

  it('should return 500 when vendor creation fails in database', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        entityId: 'a0000000-0000-4000-8000-000000000010',
        name: 'New Vendor',
      },
    });

    // Dedup check — no existing vendor
    const dedupeChain = createChainMock({ data: [], error: null });
    // Create chain — fails
    const insertChain = createChainMock({ data: null, error: { message: 'Insert failed' } });

    let fromCallCount = 0;
    mockDb.from.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) return dedupeChain;
      return insertChain;
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010', name: 'New Vendor' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Failed to create vendor');
  });
});
