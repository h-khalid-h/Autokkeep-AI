import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock Redis ──────────────────────────────────────────────────────────────
// We mock the redis module so rate-limit falls back to in-memory by default,
// or uses a controllable fake Redis when we need to test the Redis path.
const mockRedis = {
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
};

vi.mock('./redis', () => ({
  getRedisClient: vi.fn(() => null), // Default: no Redis → in-memory fallback
  default: vi.fn(() => null),
}));

// Import after mocking
import { rateLimit } from './rate-limit';
import { getRedisClient } from './redis';

const mockedGetRedisClient = vi.mocked(getRedisClient);

// ── Helpers ─────────────────────────────────────────────────────────────────
function makeRequest(ip = '127.0.0.1', path = '/api/test'): NextRequest {
  const url = `http://localhost${path}`;
  return new NextRequest(url, {
    headers: { 'x-forwarded-for': ip },
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe('rateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to no Redis by default (in-memory fallback)
    mockedGetRedisClient.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Happy Path ──────────────────────────────────────────────────────────
  describe('under limit (happy path)', () => {
    it('returns null when request count is under the limit', async () => {
      const req = makeRequest();
      const result = await rateLimit(req, { max: 5, windowSeconds: 60 });
      expect(result).toBeNull();
    });

    it('allows exactly max requests before blocking', async () => {
      const req = makeRequest('10.0.0.1', '/api/endpoint');
      const config = { max: 3, windowSeconds: 60, prefix: 'test' };

      // First 3 requests should pass
      for (let i = 0; i < 3; i++) {
        const result = await rateLimit(req, config);
        expect(result).toBeNull();
      }

      // 4th request should be blocked
      const result = await rateLimit(req, config);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
    });
  });

  // ── Over Limit ──────────────────────────────────────────────────────────
  describe('over limit', () => {
    it('returns 429 response when rate limit is exceeded', async () => {
      const req = makeRequest('10.0.0.2', '/api/test');
      const config = { max: 1, windowSeconds: 60 };

      // First request passes
      const first = await rateLimit(req, config);
      expect(first).toBeNull();

      // Second request is blocked
      const second = await rateLimit(req, config);
      expect(second).not.toBeNull();
      expect(second!.status).toBe(429);

      const body = await second!.json();
      expect(body.error).toContain('Too many requests');
    });

    it('includes rate limit headers in 429 response', async () => {
      const req = makeRequest('10.0.0.3');
      const config = { max: 1, windowSeconds: 30 };

      await rateLimit(req, config); // consume the slot
      const result = await rateLimit(req, config);

      expect(result).not.toBeNull();
      expect(result!.headers.get('X-RateLimit-Limit')).toBe('1');
      expect(result!.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(result!.headers.get('Retry-After')).toBeTruthy();
    });
  });

  // ── Key Isolation ─────────────────────────────────────────────────────
  describe('key isolation', () => {
    it('tracks different IPs independently', async () => {
      const config = { max: 1, windowSeconds: 60 };

      // IP A uses its slot
      const resultA = await rateLimit(makeRequest('1.1.1.1'), config);
      expect(resultA).toBeNull();

      // IP B should still have its own slot
      const resultB = await rateLimit(makeRequest('2.2.2.2'), config);
      expect(resultB).toBeNull();

      // IP A is now blocked
      const resultA2 = await rateLimit(makeRequest('1.1.1.1'), config);
      expect(resultA2).not.toBeNull();
    });

    it('tracks different paths independently', async () => {
      const config = { max: 1, windowSeconds: 60, prefix: 'iso' };
      const ip = '3.3.3.3';

      const result1 = await rateLimit(makeRequest(ip, '/api/one'), config);
      expect(result1).toBeNull();

      const result2 = await rateLimit(makeRequest(ip, '/api/two'), config);
      expect(result2).toBeNull();
    });

    it('uses prefix in key for namespacing', async () => {
      const ip = '4.4.4.4';
      const path = '/api/same';

      const configA = { max: 1, windowSeconds: 60, prefix: 'ns-a' };
      const configB = { max: 1, windowSeconds: 60, prefix: 'ns-b' };

      const resultA = await rateLimit(makeRequest(ip, path), configA);
      expect(resultA).toBeNull();

      const resultB = await rateLimit(makeRequest(ip, path), configB);
      expect(resultB).toBeNull();
    });
  });

  // ── Redis Path ────────────────────────────────────────────────────────
  describe('Redis integration', () => {
    beforeEach(() => {
      mockRedis.incr.mockReset();
      mockRedis.expire.mockReset();
      mockRedis.ttl.mockReset();
      // Enable Redis mock
      mockedGetRedisClient.mockReturnValue(mockRedis as unknown as ReturnType<typeof getRedisClient>);
    });

    it('uses Redis incr/expire when Redis is available', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(60);

      const req = makeRequest('5.5.5.5');
      const result = await rateLimit(req, { max: 10, windowSeconds: 60 });

      expect(result).toBeNull();
      expect(mockRedis.incr).toHaveBeenCalledTimes(1);
      expect(mockRedis.expire).toHaveBeenCalledTimes(1); // First request sets expire
      expect(mockRedis.ttl).toHaveBeenCalledTimes(1);
    });

    it('does not set expire on subsequent requests', async () => {
      mockRedis.incr.mockResolvedValue(2); // Not the first request
      mockRedis.ttl.mockResolvedValue(55);

      const req = makeRequest('6.6.6.6');
      const result = await rateLimit(req, { max: 10, windowSeconds: 60 });

      expect(result).toBeNull();
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('returns 429 when Redis reports count over max', async () => {
      mockRedis.incr.mockResolvedValue(11);
      mockRedis.ttl.mockResolvedValue(30);

      const req = makeRequest('7.7.7.7');
      const result = await rateLimit(req, { max: 10, windowSeconds: 60 });

      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
    });

    it('falls back to in-memory when Redis throws', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Connection refused'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const req = makeRequest('8.8.8.8');
      const result = await rateLimit(req, { max: 5, windowSeconds: 60 });

      // Should succeed with in-memory fallback
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis unavailable'),
        expect.any(String)
      );
      warnSpy.mockRestore();
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles max of 0 (all requests blocked)', async () => {
      const req = makeRequest('9.9.9.9');
      const result = await rateLimit(req, { max: 0, windowSeconds: 60 });
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
    });

    it('handles missing x-forwarded-for header', async () => {
      const req = new NextRequest('http://localhost/api/test');
      // No x-forwarded-for header → falls back to x-real-ip or 'unknown'
      const result = await rateLimit(req, { max: 5, windowSeconds: 60, prefix: 'nofwd' });
      expect(result).toBeNull();
    });

    it('uses default prefix when none specified', async () => {
      const req = makeRequest('10.10.10.10');
      const result = await rateLimit(req, { max: 5, windowSeconds: 60 });
      expect(result).toBeNull();
    });

    it('handles x-forwarded-for with multiple IPs (proxy chain)', async () => {
      const req = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' },
      });
      const config = { max: 1, windowSeconds: 60, prefix: 'chain' };

      const result1 = await rateLimit(req, config);
      expect(result1).toBeNull();

      // Same first IP should be rate limited
      const result2 = await rateLimit(req, config);
      expect(result2).not.toBeNull();
    });
  });

  // ── Input Validation ──────────────────────────────────────────────────
  describe('input validation / configuration', () => {
    it('works with very large window', async () => {
      const req = makeRequest('11.11.11.11');
      const result = await rateLimit(req, { max: 100, windowSeconds: 86400 }); // 24hr
      expect(result).toBeNull();
    });

    it('works with window of 1 second', async () => {
      const req = makeRequest('12.12.12.12');
      const result = await rateLimit(req, { max: 1, windowSeconds: 1 });
      expect(result).toBeNull();
    });
  });
});
