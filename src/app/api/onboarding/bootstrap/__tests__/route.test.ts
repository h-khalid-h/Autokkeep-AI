import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock getApiAuthContext
const mockRpc = vi.fn();
const mockDb = { from: vi.fn(), rpc: mockRpc };

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
  return new NextRequest('http://localhost:3000/api/onboarding/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/onboarding/bootstrap
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/onboarding/bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ entityName: 'Test Corp' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 when entityName is missing', async () => {
    const req = createPostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 when entityName is empty', async () => {
    const req = createPostRequest({ entityName: '' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 when currency is invalid format', async () => {
    const req = createPostRequest({ entityName: 'Test Corp', currency: 'invalid' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 when fiscalYearEnd is out of range', async () => {
    const req = createPostRequest({ entityName: 'Test Corp', fiscalYearEnd: '13' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 500 when RPC fails', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC function failed' },
    });

    const req = createPostRequest({ entityName: 'Test Corp' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('RPC function failed');
  });

  it('should return 500 when RPC returns null data', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: null,
    });

    const req = createPostRequest({ entityName: 'Test Corp' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Failed to create entity');
  });

  it('should bootstrap successfully on happy path', async () => {
    const rpcResult = {
      orgId: 'a0000000-0000-4000-8000-000000000050',
      entityId: 'a0000000-0000-4000-8000-000000000060',
    };
    mockRpc.mockResolvedValue({
      data: rpcResult,
      error: null,
    });

    const req = createPostRequest({ entityName: 'My Company' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.orgId).toBe('a0000000-0000-4000-8000-000000000050');
    expect(json.entityId).toBe('a0000000-0000-4000-8000-000000000060');
  });

  it('should pass correct params to RPC function', async () => {
    const rpcResult = {
      orgId: 'a0000000-0000-4000-8000-000000000050',
      entityId: 'a0000000-0000-4000-8000-000000000060',
    };
    mockRpc.mockResolvedValue({
      data: rpcResult,
      error: null,
    });

    const req = createPostRequest({
      entityName: '  My Company  ',
      fiscalYearEnd: '6',
      currency: 'EUR',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('bootstrap_onboarding', {
      p_entity_name: 'My Company',
      p_fiscal_year_end: '6',
      p_currency: 'EUR',
    });
  });

  it('should use default currency and fiscalYearEnd when not provided', async () => {
    const rpcResult = {
      orgId: 'a0000000-0000-4000-8000-000000000050',
      entityId: 'a0000000-0000-4000-8000-000000000060',
    };
    mockRpc.mockResolvedValue({
      data: rpcResult,
      error: null,
    });

    const req = createPostRequest({ entityName: 'Default Corp' });
    await POST(req);

    expect(mockRpc).toHaveBeenCalledWith('bootstrap_onboarding', {
      p_entity_name: 'Default Corp',
      p_fiscal_year_end: '12',
      p_currency: 'USD',
    });
  });
});
