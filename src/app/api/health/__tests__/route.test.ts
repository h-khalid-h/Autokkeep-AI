import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockAdminSupabase = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdminSupabase),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/health', {
    method: 'GET',
    headers,
  });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(resolvedValue);

  return chain;
}

/** Fluent chain builder for rpc() calls */
function createRpcMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../route');

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env vars so the environment check passes
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  });

  it('should return 200 with status info when database is healthy', async () => {
    // Mock rpc('version') success
    const rpcChain = createRpcMock({ data: null, error: null });
    mockRpc.mockReturnValue(rpcChain);

    const req = createRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
    expect(json.timestamp).toBeTruthy();
  });

  it('should return minimal response for unauthenticated requests', async () => {
    const rpcChain = createRpcMock({ data: null, error: null });
    mockRpc.mockReturnValue(rpcChain);

    const req = createRequest();
    const res = await GET(req);

    const json = await res.json();
    // Unauthenticated should NOT include detailed checks
    expect(json.checks).toBeUndefined();
    expect(json.uptime).toBeUndefined();
    expect(json.status).toBeDefined();
    expect(json.timestamp).toBeDefined();
  });

  it('should return detailed response for authenticated requests', async () => {
    process.env.CRON_SECRET = 'test-secret';

    // Mock rpc('version') success
    const rpcChain = createRpcMock({ data: null, error: null });
    mockRpc.mockReturnValue(rpcChain);

    const req = createRequest({ authorization: 'Bearer test-secret' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
    expect(json.checks).toBeDefined();
    expect(json.checks.database).toBeDefined();
    expect(json.checks.environment).toBeDefined();
    expect(json.uptime).toBeDefined();
    expect(json.latency).toBeDefined();
    expect(json.version).toBeDefined();
  });

  it('should return 503 when database is unhealthy', async () => {
    // Mock rpc('version') failure, then from('audit_log') fallback also fails
    const rpcChain = createRpcMock({ data: null, error: { message: 'RPC failed' } });
    mockRpc.mockReturnValue(rpcChain);

    const dbChain = createChainMock({ data: null, error: { message: 'Connection failed' } });
    mockFrom.mockReturnValue(dbChain);

    const req = createRequest();
    const res = await GET(req);

    // When DB is degraded, overall status should reflect that
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe('degraded');
  });

  it('should report degraded when env vars are missing', async () => {
    // Remove required env vars
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const rpcChain = createRpcMock({ data: null, error: null });
    mockRpc.mockReturnValue(rpcChain);

    const req = createRequest();
    const res = await GET(req);

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe('degraded');
  });
});

