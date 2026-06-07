import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockAdminSupabase = {
  rpc: mockRpc,
  from: mockFrom,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdminSupabase),
}));

const mockPing = vi.fn();
const mockRedisClient = {
  ping: mockPing,
};

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn().mockReturnValue(mockRedisClient),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Fluent chain builder for rpc() calls */
function createRpcMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  return chain;
}

/** Fluent chain builder for Supabase from() queries */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(resolvedValue);
  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { checkDatabaseHealth, checkRedisHealth, getSystemHealth } = await import('@/lib/database/health');

describe('Database Health Monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://testproject.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  // ── checkDatabaseHealth ──────────────────────────────────────────────────

  describe('checkDatabaseHealth', () => {
    it('returns connected status when database is reachable', async () => {
      const rpcChain = createRpcMock({ data: null, error: null });
      mockRpc.mockReturnValue(rpcChain);

      const result = await checkDatabaseHealth();

      expect(result.connected).toBe(true);
      expect(result.timestamp).toBeTruthy();
      expect(result.supabaseProjectRef).toBe('testproject');
    });

    it('measures response time accurately', async () => {
      const rpcChain = createRpcMock({ data: null, error: null });
      mockRpc.mockReturnValue(rpcChain);

      const result = await checkDatabaseHealth();

      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.responseTimeMs).toBe('number');
      // Should be a reasonable time (under 5 seconds for a mock)
      expect(result.responseTimeMs).toBeLessThan(5000);
    });

    it('handles database errors gracefully', async () => {
      // rpc fails
      const rpcChain = createRpcMock({ data: null, error: { message: 'RPC failed' } });
      mockRpc.mockReturnValue(rpcChain);

      // Fallback from() also fails
      const dbChain = createChainMock({ data: null, error: { message: 'Connection refused' } });
      mockFrom.mockReturnValue(dbChain);

      const result = await checkDatabaseHealth();

      expect(result.connected).toBe(false);
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeTruthy();
    });

    it('returns pool stats with expected shape', async () => {
      const rpcChain = createRpcMock({ data: null, error: null });
      mockRpc.mockReturnValue(rpcChain);

      const result = await checkDatabaseHealth();

      expect(result.poolStats).toBeDefined();
      expect(typeof result.poolStats.active).toBe('number');
      expect(typeof result.poolStats.idle).toBe('number');
      expect(typeof result.poolStats.waiting).toBe('number');
      expect(typeof result.poolStats.maxConnections).toBe('number');
      expect(result.poolStats.maxConnections).toBeGreaterThan(0);
    });
  });

  // ── checkRedisHealth ─────────────────────────────────────────────────────

  describe('checkRedisHealth', () => {
    it('returns connected when Redis is reachable', async () => {
      mockPing.mockResolvedValue('PONG');

      const result = await checkRedisHealth();

      expect(result.connected).toBe(true);
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('handles Redis down gracefully', async () => {
      mockPing.mockRejectedValue(new Error('Connection refused'));

      const result = await checkRedisHealth();

      expect(result.connected).toBe(false);
      expect(typeof result.responseTimeMs).toBe('number');
    });

    it('returns disconnected when REDIS_URL is not set', async () => {
      delete process.env.REDIS_URL;

      const result = await checkRedisHealth();

      expect(result.connected).toBe(false);
      expect(result.responseTimeMs).toBe(0);
    });
  });

  // ── getSystemHealth ──────────────────────────────────────────────────────

  describe('getSystemHealth', () => {
    it('returns complete system health report', async () => {
      const rpcChain = createRpcMock({ data: null, error: null });
      mockRpc.mockReturnValue(rpcChain);
      mockPing.mockResolvedValue('PONG');

      const report = await getSystemHealth();

      expect(report.status).toBeDefined();
      expect(report.database).toBeDefined();
      expect(report.redis).toBeDefined();
      expect(report.uptime).toBeGreaterThanOrEqual(0);
      expect(report.timestamp).toBeTruthy();
      expect(report.environment).toBeDefined();
      expect(report.version).toBeDefined();
    });

    it('includes memory usage fields', async () => {
      const rpcChain = createRpcMock({ data: null, error: null });
      mockRpc.mockReturnValue(rpcChain);
      mockPing.mockResolvedValue('PONG');

      const report = await getSystemHealth();

      expect(report.memoryUsage).toBeDefined();
      expect(typeof report.memoryUsage.heapUsed).toBe('number');
      expect(typeof report.memoryUsage.heapTotal).toBe('number');
      expect(typeof report.memoryUsage.rss).toBe('number');
      expect(typeof report.memoryUsage.external).toBe('number');
      expect(report.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(report.memoryUsage.rss).toBeGreaterThan(0);
    });

    it('reports healthy when all services are up', async () => {
      const rpcChain = createRpcMock({ data: null, error: null });
      mockRpc.mockReturnValue(rpcChain);
      mockPing.mockResolvedValue('PONG');

      const report = await getSystemHealth();

      expect(report.status).toBe('healthy');
      expect(report.database.connected).toBe(true);
      expect(report.redis.connected).toBe(true);
    });

    it('reports degraded when Redis is down but DB is up', async () => {
      const rpcChain = createRpcMock({ data: null, error: null });
      mockRpc.mockReturnValue(rpcChain);
      mockPing.mockRejectedValue(new Error('Redis connection refused'));

      const report = await getSystemHealth();

      expect(report.status).toBe('degraded');
      expect(report.database.connected).toBe(true);
      expect(report.redis.connected).toBe(false);
    });

    it('reports unhealthy when database is down', async () => {
      // rpc fails
      const rpcChain = createRpcMock({ data: null, error: { message: 'DB down' } });
      mockRpc.mockReturnValue(rpcChain);

      // Fallback also fails
      const dbChain = createChainMock({ data: null, error: { message: 'Connection refused' } });
      mockFrom.mockReturnValue(dbChain);

      // Redis is up
      mockPing.mockResolvedValue('PONG');

      const report = await getSystemHealth();

      expect(report.status).toBe('unhealthy');
      expect(report.database.connected).toBe(false);
    });
  });
});
