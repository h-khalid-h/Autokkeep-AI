// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests — Rate Limit Stats Collector
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimitStats } from './rate-limit-stats';

describe('rateLimitStats', () => {
  beforeEach(() => {
    rateLimitStats.reset();
  });

  describe('recordRequest()', () => {
    it('tracks total requests for an endpoint', () => {
      rateLimitStats.recordRequest('/api/test', false, { max: 10, windowSeconds: 60 });
      rateLimitStats.recordRequest('/api/test', false, { max: 10, windowSeconds: 60 });
      rateLimitStats.recordRequest('/api/test', false, { max: 10, windowSeconds: 60 });

      const stat = rateLimitStats.getEndpointStats('/api/test');
      expect(stat).toBeDefined();
      expect(stat!.totalRequests).toBe(3);
      expect(stat!.throttledRequests).toBe(0);
    });

    it('tracks throttled requests and updates lastThrottledAt', () => {
      rateLimitStats.recordRequest('/api/test', false, { max: 10, windowSeconds: 60 });
      rateLimitStats.recordRequest('/api/test', true, { max: 10, windowSeconds: 60 });

      const stat = rateLimitStats.getEndpointStats('/api/test');
      expect(stat!.totalRequests).toBe(2);
      expect(stat!.throttledRequests).toBe(1);
      expect(stat!.lastThrottledAt).toBeTruthy();
      expect(stat!.lastThrottledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('stores window config from the rate limit', () => {
      rateLimitStats.recordRequest('/api/test', false, { max: 50, windowSeconds: 120 });

      const stat = rateLimitStats.getEndpointStats('/api/test');
      expect(stat!.maxRequests).toBe(50);
      expect(stat!.windowSeconds).toBe(120);
    });
  });

  describe('throttle rate calculation', () => {
    it('calculates throttle rate as a percentage', () => {
      // 3 out of 10 throttled = 30%
      for (let i = 0; i < 7; i++) {
        rateLimitStats.recordRequest('/api/test', false, { max: 10, windowSeconds: 60 });
      }
      for (let i = 0; i < 3; i++) {
        rateLimitStats.recordRequest('/api/test', true, { max: 10, windowSeconds: 60 });
      }

      const stat = rateLimitStats.getEndpointStats('/api/test');
      expect(stat!.throttleRate).toBe(30);
    });

    it('returns 0 throttle rate when no requests are throttled', () => {
      rateLimitStats.recordRequest('/api/test', false, { max: 10, windowSeconds: 60 });

      const stat = rateLimitStats.getEndpointStats('/api/test');
      expect(stat!.throttleRate).toBe(0);
    });

    it('returns 100 throttle rate when all requests are throttled', () => {
      rateLimitStats.recordRequest('/api/test', true, { max: 10, windowSeconds: 60 });
      rateLimitStats.recordRequest('/api/test', true, { max: 10, windowSeconds: 60 });

      const stat = rateLimitStats.getEndpointStats('/api/test');
      expect(stat!.throttleRate).toBe(100);
    });
  });

  describe('multiple endpoints', () => {
    it('tracks stats independently for each endpoint', () => {
      rateLimitStats.recordRequest('/api/a', false, { max: 10, windowSeconds: 60 });
      rateLimitStats.recordRequest('/api/a', true, { max: 10, windowSeconds: 60 });
      rateLimitStats.recordRequest('/api/b', false, { max: 20, windowSeconds: 120 });
      rateLimitStats.recordRequest('/api/b', false, { max: 20, windowSeconds: 120 });
      rateLimitStats.recordRequest('/api/b', false, { max: 20, windowSeconds: 120 });

      const statA = rateLimitStats.getEndpointStats('/api/a');
      const statB = rateLimitStats.getEndpointStats('/api/b');

      expect(statA!.totalRequests).toBe(2);
      expect(statA!.throttledRequests).toBe(1);
      expect(statB!.totalRequests).toBe(3);
      expect(statB!.throttledRequests).toBe(0);
    });
  });

  describe('getStats()', () => {
    it('returns all endpoints sorted by throttle rate descending', () => {
      // endpoint A: 50% throttled
      rateLimitStats.recordRequest('/api/a', false, { max: 10, windowSeconds: 60 });
      rateLimitStats.recordRequest('/api/a', true, { max: 10, windowSeconds: 60 });

      // endpoint B: 0% throttled
      rateLimitStats.recordRequest('/api/b', false, { max: 10, windowSeconds: 60 });

      // endpoint C: 100% throttled
      rateLimitStats.recordRequest('/api/c', true, { max: 10, windowSeconds: 60 });

      const stats = rateLimitStats.getStats();
      expect(stats).toHaveLength(3);
      expect(stats[0].endpoint).toBe('/api/c'); // 100%
      expect(stats[1].endpoint).toBe('/api/a'); // 50%
      expect(stats[2].endpoint).toBe('/api/b'); // 0%
    });

    it('returns empty array when no stats recorded', () => {
      expect(rateLimitStats.getStats()).toEqual([]);
    });
  });

  describe('getEndpointStats()', () => {
    it('returns undefined for unknown endpoints', () => {
      expect(rateLimitStats.getEndpointStats('/api/unknown')).toBeUndefined();
    });

    it('returns stats for a known endpoint', () => {
      rateLimitStats.recordRequest('/api/test', false, { max: 10, windowSeconds: 60 });

      const stat = rateLimitStats.getEndpointStats('/api/test');
      expect(stat).toBeDefined();
      expect(stat!.endpoint).toBe('/api/test');
    });
  });

  describe('reset()', () => {
    it('clears all tracked stats', () => {
      rateLimitStats.recordRequest('/api/a', false, { max: 10, windowSeconds: 60 });
      rateLimitStats.recordRequest('/api/b', true, { max: 10, windowSeconds: 60 });

      rateLimitStats.reset();

      expect(rateLimitStats.getStats()).toEqual([]);
      expect(rateLimitStats.getEndpointStats('/api/a')).toBeUndefined();
      expect(rateLimitStats.getEndpointStats('/api/b')).toBeUndefined();
    });
  });
});
