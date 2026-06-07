import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  validateApiKey,
  registerApiKey,
  clearApiKeys,
  hashApiKey,
  getApiKeyByHash,
  type PublicApiContext,
} from './public-api-auth';

// Suppress logger output during tests
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(apiKey?: string): NextRequest {
  const headers = new Headers();
  if (apiKey) {
    headers.set('x-api-key', apiKey);
  }
  return new NextRequest('http://localhost/api/v1/transactions', { headers });
}

const TEST_KEY = 'ak_test_1234567890abcdef';
const TEST_ORG_ID = 'org-uuid-1234';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Public API Auth', () => {
  beforeEach(async () => {
    clearApiKeys();
    await registerApiKey(TEST_KEY, {
      id: 'key-1',
      orgId: TEST_ORG_ID,
      name: 'Test Key',
      permissions: ['read:transactions', 'read:entities'],
    });
  });

  afterEach(() => {
    clearApiKeys();
    vi.restoreAllMocks();
  });

  it('returns PublicApiContext for a valid API key', async () => {
    const result = await validateApiKey(makeRequest(TEST_KEY));

    // Should NOT be a NextResponse (i.e., it's a success context)
    expect(result).not.toHaveProperty('status');
    const ctx = result as PublicApiContext;
    expect(ctx.orgId).toBe(TEST_ORG_ID);
    expect(ctx.apiKeyId).toBe('key-1');
    expect(ctx.permissions).toContain('read:transactions');
    expect(ctx.permissions).toContain('read:entities');
  });

  it('returns 401 for an invalid API key', async () => {
    const result = await validateApiKey(makeRequest('ak_invalid_key'));

    // Check it's a Response with 401
    expect(result).toHaveProperty('status');
    expect((result as Response).status).toBe(401);
    const body = await (result as Response).json();
    expect(body.error).toContain('Invalid API key');
  });

  it('returns 401 for an inactive API key', async () => {
    const inactiveKey = 'ak_test_inactive_key';
    await registerApiKey(inactiveKey, {
      id: 'key-inactive',
      orgId: TEST_ORG_ID,
      name: 'Inactive Key',
      isActive: false,
    });

    const result = await validateApiKey(makeRequest(inactiveKey));

    expect(result).toHaveProperty('status');
    expect((result as Response).status).toBe(401);
    const body = await (result as Response).json();
    expect(body.error).toContain('inactive');
  });

  it('returns 401 when X-API-Key header is missing', async () => {
    const result = await validateApiKey(makeRequest());

    expect(result).toHaveProperty('status');
    expect((result as Response).status).toBe(401);
    const body = await (result as Response).json();
    expect(body.error).toContain('Missing API key');
  });

  it('tracks lastUsedAt on successful authentication', async () => {
    const keyHash = await hashApiKey(TEST_KEY);
    const beforeAuth = getApiKeyByHash(keyHash);
    expect(beforeAuth?.lastUsedAt).toBeNull();

    await validateApiKey(makeRequest(TEST_KEY));

    const afterAuth = getApiKeyByHash(keyHash);
    expect(afterAuth?.lastUsedAt).not.toBeNull();
    const ts = new Date(afterAuth!.lastUsedAt!);
    expect(ts.getTime()).not.toBeNaN();
    // Should be recent (within last 5 seconds)
    expect(Date.now() - ts.getTime()).toBeLessThan(5_000);
  });

  it('hashApiKey produces consistent SHA-256 hex digest', async () => {
    const hash1 = await hashApiKey('test-key');
    const hash2 = await hashApiKey('test-key');
    expect(hash1).toBe(hash2);
    // SHA-256 produces 64 hex characters
    expect(hash1).toHaveLength(64);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different keys produce different hashes', async () => {
    const hash1 = await hashApiKey('key-alpha');
    const hash2 = await hashApiKey('key-beta');
    expect(hash1).not.toBe(hash2);
  });
});
