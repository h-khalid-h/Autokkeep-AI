import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/ai/health-monitor', () => ({
  runHealthCheck: vi.fn().mockResolvedValue([
    {
      id: 'a0000000-0000-4000-8000-000000000050',
      entityId: 'a0000000-0000-4000-8000-000000000010',
      alertType: 'missing_receipt',
      severity: 'warning',
      title: 'Missing receipts',
      description: 'Some transactions have no receipts',
      data: {},
      isRead: false,
      isDismissed: false,
    },
  ]),
  computeHealthScore: vi.fn().mockReturnValue(82),
}));

vi.mock('@/lib/validation', () => ({
  parseBody: vi.fn(),
  schemas: { healthAlertAction: {} },
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
  const url = new URL('http://localhost:3000/api/insights/health');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

function createPatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/insights/health', {
    method: 'PATCH',
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

const { GET, PATCH } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');
const { parseBody } = await import('@/lib/validation');

// ─── GET Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/insights/health', () => {
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
    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('entityId query parameter is required');
  });

  it('should return 403 when entity is not found', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return health alerts (happy path, fresh check)', async () => {
    // Entity lookup succeeds
    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003' },
      error: null,
    });
    // No cached alerts
    const cachedChain = createChainMock({ data: [], error: null });

    let _entityCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') {
        _entityCallCount++;
        return entityChain;
      }
      if (table === 'health_alerts') return cachedChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alerts).toBeDefined();
    expect(json.healthScore).toBeDefined();
    expect(json.alertCount).toBeDefined();
  });
});

// ─── PATCH Tests ────────────────────────────────────────────────────────────────

describe('PATCH /api/insights/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPatchRequest({ alertId: 'a0000000-0000-4000-8000-000000000050', action: 'dismiss' });
    const res = await PATCH(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 for invalid body (validation failure)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: NextResponse.json(
        { error: 'Validation failed', details: [{ field: 'alertId', message: 'Required' }] },
        { status: 400 },
      ),
    });

    const req = createPatchRequest({});
    const res = await PATCH(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('should return 404 when alert is not found', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { alertId: 'a0000000-0000-4000-8000-000000000099', action: 'dismiss' },
    });

    const alertChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(alertChain);

    const req = createPatchRequest({ alertId: 'a0000000-0000-4000-8000-000000000099', action: 'dismiss' });
    const res = await PATCH(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Alert not found');
  });

  it('should dismiss alert successfully (happy path)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { alertId: 'a0000000-0000-4000-8000-000000000050', action: 'dismiss' },
    });

    // Alert lookup
    const alertChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000050', entity_id: 'a0000000-0000-4000-8000-000000000010' },
      error: null,
    });
    // Entity access check
    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010' },
      error: null,
    });
    // Update
    const updateChain = createChainMock({ data: null, error: null });

    let healthAlertsCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'health_alerts') {
        healthAlertsCallCount++;
        if (healthAlertsCallCount === 1) return alertChain;
        return updateChain;
      }
      if (table === 'entities') return entityChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPatchRequest({ alertId: 'a0000000-0000-4000-8000-000000000050', action: 'dismiss' });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.alertId).toBe('a0000000-0000-4000-8000-000000000050');
    expect(json.action).toBe('dismiss');
  });
});
