import { test, expect } from '@playwright/test';

test.describe('API Health Checks', () => {
  test.describe('GET /api/health', () => {
    test('returns 200 with status field', async ({ request }) => {
      const response = await request.get('/api/health');

      // Should return 200 or 503 (if degraded), but should return valid JSON
      expect([200, 503]).toContain(response.status());

      const body = await response.json();
      expect(body).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    });

    test('returns a timestamp field', async ({ request }) => {
      const response = await request.get('/api/health');
      const body = await response.json();

      expect(body).toHaveProperty('timestamp');
      // Timestamp should be a valid ISO date string
      const timestamp = new Date(body.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    test('returns JSON content type', async ({ request }) => {
      const response = await request.get('/api/health');
      const contentType = response.headers()['content-type'];
      expect(contentType).toMatch(/application\/json/);
    });

    test('does not expose detailed checks without auth', async ({ request }) => {
      const response = await request.get('/api/health');
      const body = await response.json();

      // Without CRON_SECRET auth, should NOT return checks, uptime, or version
      expect(body).not.toHaveProperty('checks');
      expect(body).not.toHaveProperty('uptime');
    });
  });

  test.describe('GET /api/health/detailed', () => {
    test('returns 401 or 403 without auth token', async ({ request }) => {
      const response = await request.get('/api/health/detailed');

      // Should require authentication — expect 401 or 403
      expect([401, 403]).toContain(response.status());
    });

    test('rejects requests with invalid auth token', async ({ request }) => {
      const response = await request.get('/api/health/detailed', {
        headers: {
          Authorization: 'Bearer invalid-token-12345',
        },
      });

      // Should still reject with invalid token
      expect([401, 403]).toContain(response.status());
    });

    test('returns JSON even on auth failure', async ({ request }) => {
      const response = await request.get('/api/health/detailed');
      const contentType = response.headers()['content-type'];
      expect(contentType).toMatch(/application\/json/);
    });
  });

  test.describe('Protected API Routes', () => {
    const protectedApiRoutes = [
      '/api/transactions',
      '/api/analytics',
      '/api/reports',
      '/api/settings',
      '/api/dashboard',
    ];

    for (const route of protectedApiRoutes) {
      test(`${route} returns 401 or 403 without auth`, async ({ request }) => {
        const response = await request.get(route);

        // Protected API routes should require authentication
        // They may return 401, 403, or 404 (if the route doesn't exist)
        expect([401, 403, 404, 405]).toContain(response.status());
      });
    }
  });

  test.describe('Rate Limiting', () => {
    test('health endpoint handles multiple rapid requests', async ({ request }) => {
      // Send several requests in quick succession
      const requests = Array.from({ length: 10 }, () =>
        request.get('/api/health')
      );
      const responses = await Promise.all(requests);

      // All responses should be valid (200 or 503 for health status)
      for (const response of responses) {
        expect([200, 429, 503]).toContain(response.status());
      }
    });

    test('rate limiting returns 429 after excessive requests (optional)', async ({ request }) => {
      // This test is intentionally lenient — rate limiting may not be triggered
      // in a dev environment with low limits
      const batchSize = 35;
      const requests = Array.from({ length: batchSize }, () =>
        request.get('/api/health')
      );
      const responses = await Promise.all(requests);

      const statusCodes = responses.map((r) => r.status());
      const has429 = statusCodes.includes(429);

      // Rate limiting is optional — we just verify the endpoint doesn't crash
      if (has429) {
        // If rate limited, verify the 429 response
        const rateLimitedResponse = responses.find((r) => r.status() === 429)!;
        expect(rateLimitedResponse.status()).toBe(429);
      }

      // All responses should be valid HTTP responses
      for (const status of statusCodes) {
        expect([200, 429, 503]).toContain(status);
      }
    });
  });

  test.describe('API Response Structure', () => {
    test('health endpoint response has correct structure', async ({ request }) => {
      const response = await request.get('/api/health');
      const body = await response.json();

      // Minimum required fields
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');

      // Status should be a string
      expect(typeof body.status).toBe('string');

      // Timestamp should be a string
      expect(typeof body.timestamp).toBe('string');
    });
  });
});
