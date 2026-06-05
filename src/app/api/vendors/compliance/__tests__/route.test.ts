import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

const mockGetVendors1099Status = vi.fn();
const mockGetW9Summary = vi.fn();
vi.mock('@/lib/vendors/service', () => ({
  getVendors1099Status: (...args: unknown[]) => mockGetVendors1099Status(...args),
  getW9Summary: (...args: unknown[]) => mockGetW9Summary(...args),
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

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/vendors/compliance');
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('GET /api/vendors/compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest({ entityId: 'ent-1' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('should return 400 when entityId is missing', async () => {
    const req = createGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('entityId query parameter is required');
  });

  it('should return 403 when entityId is not in user entities', async () => {
    const req = createGetRequest({ entityId: 'ent-999' });
    const res = await GET(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return compliance data on success', async () => {
    mockGetVendors1099Status.mockResolvedValue([
      { name: 'Vendor A', needs1099Filing: true, ytdPayments: 800 },
      { name: 'Vendor B', needs1099Filing: false, ytdPayments: 200 },
    ]);
    mockGetW9Summary.mockResolvedValue({
      totalVendors: 10,
      verified: 8,
      notCollected: 2,
    });

    const req = createGetRequest({ entityId: 'ent-1' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vendorsNeeding1099).toHaveLength(1);
    expect(json.vendorsApproaching1099).toHaveLength(1);
    expect(json.w9Summary.totalVendors).toBe(10);
    expect(json.complianceScore).toBe(80);
  });

  it('should return 100% score when no vendors', async () => {
    mockGetVendors1099Status.mockResolvedValue([]);
    mockGetW9Summary.mockResolvedValue({
      totalVendors: 0,
      verified: 0,
      notCollected: 0,
    });

    const req = createGetRequest({ entityId: 'ent-1' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.complianceScore).toBe(100);
  });

  it('should return 500 when service throws', async () => {
    mockGetVendors1099Status.mockRejectedValue(new Error('DB error'));

    const req = createGetRequest({ entityId: 'ent-1' });
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch compliance data');
  });
});
