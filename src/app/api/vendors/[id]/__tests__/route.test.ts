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

vi.mock('@/lib/vendors/service', () => ({
  IRS_1099_THRESHOLD: 600,
  W9_EXPIRATION_YEARS: 3,
}));

const mockDb = { from: vi.fn() };
const mockAuthContext = {
  user: { id: 'a0000000-0000-4000-8000-000000000001', email: 'user@example.com' },
  membership: { id: 'a0000000-0000-4000-8000-000000000002', org_id: 'org-1', role: 'owner' },
  db: mockDb,
  entityIds: ['ent-1'],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

function createGetRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/vendors/v-1', { method: 'GET' });
}

function createPatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/vendors/v-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createDeleteRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/vendors/v-1', { method: 'DELETE' });
}

const routeContext = { params: Promise.resolve({ id: 'v-1' }) };

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET, PATCH, DELETE: DELETE_HANDLER } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/vendors/[id]
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/vendors/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest();
    const res = await GET(req, routeContext);
    expect(res.status).toBe(401);
  });

  it('should return 404 when no entity IDs', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockAuthContext,
      entityIds: [],
    });

    const req = createGetRequest();
    const res = await GET(req, routeContext);
    expect(res.status).toBe(404);
  });

  it('should return 404 when vendor not found', async () => {
    const chain = createChainMock({ data: null, error: { code: 'PGRST116' } });
    mockDb.from.mockReturnValue(chain);

    const req = createGetRequest();
    const res = await GET(req, routeContext);
    expect(res.status).toBe(404);
  });

  it('should return vendor with compliance status on success', async () => {
    const vendor = {
      id: 'v-1',
      entity_id: 'ent-1',
      name: 'Test Vendor',
      vendor_type: 'individual',
      w9_status: 'received',
      w9_received_at: new Date().toISOString(),
      is_1099_eligible: true,
      ytd_payments: 700,
      ytd_payment_count: 5,
      last_payment_date: '2024-01-01',
      is_active: true,
    };
    const chain = createChainMock({ data: vendor, error: null });
    mockDb.from.mockReturnValue(chain);

    const req = createGetRequest();
    const res = await GET(req, routeContext);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vendor.name).toBe('Test Vendor');
    expect(json.complianceStatus).toBeDefined();
    expect(json.complianceStatus.exceeds1099Threshold).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/vendors/[id]
// ═══════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/vendors/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPatchRequest({ email: 'new@test.com' });
    const res = await PATCH(req, routeContext);
    expect(res.status).toBe(401);
  });

  it('should return 404 when vendor not found', async () => {
    const chain = createChainMock({ data: null, error: { code: 'PGRST116' } });
    mockDb.from.mockReturnValue(chain);

    const req = createPatchRequest({ email: 'new@test.com' });
    const res = await PATCH(req, routeContext);
    expect(res.status).toBe(404);
  });

  it('should update vendor and return updated data', async () => {
    const existing = { id: 'v-1', entity_id: 'ent-1', name: 'Vendor', w9_status: 'not_collected' };
    const fetchChain = createChainMock({ data: existing, error: null });
    const updated = { ...existing, email: 'new@test.com' };
    const updateChain = createChainMock({ data: updated, error: null });
    mockDb.from.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain).mockReturnValue(updateChain);

    const req = createPatchRequest({ email: 'new@test.com' });
    const res = await PATCH(req, routeContext);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vendor.email).toBe('new@test.com');
  });

  it('should return 400 when no fields provided', async () => {
    const existing = { id: 'v-1', entity_id: 'ent-1', name: 'Vendor', w9_status: 'not_collected' };
    const fetchChain = createChainMock({ data: existing, error: null });
    mockDb.from.mockReturnValue(fetchChain);

    const req = createPatchRequest({});
    const res = await PATCH(req, routeContext);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/vendors/[id]
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/vendors/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createDeleteRequest();
    const res = await DELETE_HANDLER(req, routeContext);
    expect(res.status).toBe(401);
  });

  it('should return 404 when vendor not found', async () => {
    const chain = createChainMock({ data: null, error: { code: 'PGRST116' } });
    mockDb.from.mockReturnValue(chain);

    const req = createDeleteRequest();
    const res = await DELETE_HANDLER(req, routeContext);
    expect(res.status).toBe(404);
  });

  it('should soft-delete vendor and return success', async () => {
    const existing = { id: 'v-1', entity_id: 'ent-1', name: 'Vendor', vendor_type: 'individual', is_active: true };
    const fetchChain = createChainMock({ data: existing, error: null });
    const deleteChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValueOnce(fetchChain).mockReturnValueOnce(deleteChain).mockReturnValue(deleteChain);

    const req = createDeleteRequest();
    const res = await DELETE_HANDLER(req, routeContext);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
