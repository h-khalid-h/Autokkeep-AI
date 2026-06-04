import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

const mockIsAdminEmail = vi.fn();
vi.mock('@/lib/admin', () => ({
  isAdminEmail: (...args: unknown[]) => mockIsAdminEmail(...args),
}));

const mockGetUser = vi.fn();
const mockServerClient = {
  auth: {
    getUser: mockGetUser,
  },
};
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockServerClient),
}));

const mockAdminFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({ from: mockAdminFrom }),
}));

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn().mockReturnValue(null),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createGetRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/system', { method: 'GET' });
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

const { GET } = await import('../route');

describe('GET /api/admin/system', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('should return 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 403 when user is not admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'regular@example.com' } },
      error: null,
    });
    mockIsAdminEmail.mockReturnValue(false);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });

  // ── Grouped env status ────────────────────────────────────────────────────

  it('should return grouped environment status', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@example.com' } },
      error: null,
    });
    mockIsAdminEmail.mockReturnValue(true);

    // DB health check chain
    const dbHealthChain = createChainMock({ data: null, error: null, count: 1 });
    // Latest transaction chain
    const latestTxChain = createChainMock({
      data: { created_at: '2026-06-01T00:00:00Z' },
      error: null,
    });
    // Audit log chain
    const auditChain = createChainMock({ data: null, error: null, count: 42 });

    let _adminCallCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      _adminCallCount++;
      if (table === 'organizations') return dbHealthChain;
      if (table === 'transactions') return latestTxChain;
      if (table === 'audit_log') return auditChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    // Check environment keys exist and are booleans
    expect(json.environment).toBeDefined();
    expect(typeof json.environment.supabase).toBe('boolean');
    expect(typeof json.environment.openai).toBe('boolean');
    expect(typeof json.environment.plaid).toBe('boolean');
    expect(typeof json.environment.stripe).toBe('boolean');
  });

  // ── System metrics ────────────────────────────────────────────────────────

  it('should return system metrics structure', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@example.com' } },
      error: null,
    });
    mockIsAdminEmail.mockReturnValue(true);

    const healthChain = createChainMock({ data: null, error: null, count: 1 });
    const txChain = createChainMock({
      data: { created_at: '2026-06-01T00:00:00Z' },
      error: null,
    });
    const auditChain = createChainMock({ data: null, error: null, count: 10 });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return healthChain;
      if (table === 'transactions') return txChain;
      if (table === 'audit_log') return auditChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    // Verify expected system metric keys
    expect(json.uptime).toBeDefined();
    expect(typeof json.uptime).toBe('number');
    expect(json.timestamp).toBeDefined();
    expect(json.database).toBeDefined();
    expect(json.database.status).toBe('healthy');
    expect(typeof json.database.latencyMs).toBe('number');
    expect(json.redis).toBeDefined();
    expect(json.cron).toBeDefined();
    expect(json.audit).toBeDefined();
    expect(typeof json.audit.actionsLast24h).toBe('number');
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('should report unhealthy database when DB health check throws', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@example.com' } },
      error: null,
    });
    mockIsAdminEmail.mockReturnValue(true);

    // Make the admin client throw — the route catches this internally
    // and reports database.status = 'unhealthy' rather than returning 500
    mockAdminFrom.mockImplementation(() => {
      throw new Error('DB connection failed');
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.database.status).toBe('unhealthy');
  });
});
