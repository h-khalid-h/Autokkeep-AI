import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  withSentryHandler: vi.fn((handler: unknown) => handler),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockRefreshConnectionToken = vi.fn();
vi.mock('@/lib/ledger/token-refresh', () => ({
  refreshConnectionToken: (...args: unknown[]) => mockRefreshConnectionToken(...args),
  computeTokenExpiresAt: vi.fn().mockReturnValue('2025-12-31T00:00:00Z'),
}));

vi.mock('@/lib/crypto', () => ({
  encryptToken: vi.fn().mockImplementation((token: string) => `encrypted_${token}`),
}));

// ─── Supabase admin mock ────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
let mockSelectResult: { data: any; error: any } = { data: [], error: null };
const updateCalls: Array<{ data: any; filters: Record<string, any> }> = [];

function createMockUpdateChain() {
  const chain: any = {};
  const call: any = { data: null, filters: {} };
  updateCalls.push(call);

  chain.eq = vi.fn().mockImplementation((col: string, val: any) => {
    call.filters[col] = val;
    return chain;
  });
  chain.then = (resolve: any) => resolve({ error: null });
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            lt: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                then: vi.fn((resolve: any) => resolve(mockSelectResult)),
              }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockImplementation((data: any) => {
        const chain = createMockUpdateChain();
        updateCalls[updateCalls.length - 1].data = data;
        return chain;
      }),
    }),
  })),
}));
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createCronRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) {
    headers['authorization'] = `Bearer ${secret}`;
  }
  return new NextRequest('http://localhost:3000/api/cron/token-refresh', {
    method: 'GET',
    headers,
  });
}

function makeConnection(overrides: Partial<{
  id: string;
  entity_id: string;
  provider: string;
  access_token: string;
  refresh_token: string;
  realm_id: string | null;
  tenant_id: string | null;
  is_active: boolean;
  token_expires_at: string;
  refresh_failures: number;
}> = {}) {
  return {
    id: overrides.id ?? 'conn-1',
    entity_id: overrides.entity_id ?? 'entity-1',
    provider: overrides.provider ?? 'quickbooks',
    access_token: overrides.access_token ?? 'old-access-token',
    refresh_token: overrides.refresh_token ?? 'old-refresh-token',
    realm_id: overrides.realm_id ?? 'realm-123',
    tenant_id: overrides.tenant_id ?? null,
    is_active: overrides.is_active ?? true,
    token_expires_at: overrides.token_expires_at ?? '2025-06-01T00:00:00Z',
    refresh_failures: overrides.refresh_failures ?? 0,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../../token-refresh/route');

describe('GET /api/cron/token-refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    process.env.CRON_SECRET = 'test-cron-secret';
    mockSelectResult = { data: [], error: null };
  });

  it('returns 401 without CRON_SECRET header', async () => {
    const req = createCronRequest();
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 401 with wrong CRON_SECRET', async () => {
    const req = createCronRequest('wrong-secret');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 200 with valid CRON_SECRET and no expiring connections', async () => {
    mockSelectResult = { data: [], error: null };

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.refreshed).toBe(0);
    expect(json.failed).toBe(0);
    expect(json.message).toBe('No tokens expiring soon');
  });

  it('returns 200 with null connections', async () => {
    mockSelectResult = { data: null, error: null };

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.refreshed).toBe(0);
  });

  it('resets refresh_failures on successful refresh', async () => {
    const conn = makeConnection({ refresh_failures: 2 });
    mockSelectResult = { data: [conn], error: null };

    mockRefreshConnectionToken.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600,
    });

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.refreshed).toBe(1);
    expect(json.failed).toBe(0);

    // Verify the update set refresh_failures to 0
    const successUpdate = updateCalls.find(
      (c) => c.data && c.data.refresh_failures === 0
    );
    expect(successUpdate).toBeDefined();
  });

  it('increments refresh_failures on error', async () => {
    const conn = makeConnection({ refresh_failures: 1 });
    mockSelectResult = { data: [conn], error: null };

    mockRefreshConnectionToken.mockRejectedValue(new Error('OAuth token expired'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.refreshed).toBe(0);
    expect(json.failed).toBe(1);
    expect(json.errors[0].error).toBe('OAuth token expired');

    // Verify the update incremented refresh_failures from 1 to 2
    const failUpdate = updateCalls.find(
      (c) => c.data && c.data.refresh_failures === 2
    );
    expect(failUpdate).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('deactivates connection after 3+ consecutive failures', async () => {
    // Connection already has 2 failures — this will be the 3rd
    const conn = makeConnection({ refresh_failures: 2 });
    mockSelectResult = { data: [conn], error: null };

    mockRefreshConnectionToken.mockRejectedValue(new Error('Provider down'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failed).toBe(1);

    // Verify the update set is_active to false AND refresh_failures to 3
    const deactivateUpdate = updateCalls.find(
      (c) => c.data && c.data.is_active === false && c.data.refresh_failures === 3
    );
    expect(deactivateUpdate).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('does NOT deactivate after only 2 failures', async () => {
    // Connection has 1 failure — this will be the 2nd (< 3 threshold)
    const conn = makeConnection({ refresh_failures: 1 });
    mockSelectResult = { data: [conn], error: null };

    mockRefreshConnectionToken.mockRejectedValue(new Error('Temporary error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);

    // Should NOT set is_active = false (refresh_failures only becomes 2)
    const deactivateUpdate = updateCalls.find(
      (c) => c.data && c.data.is_active === false
    );
    expect(deactivateUpdate).toBeUndefined();

    // Should set refresh_failures to 2
    const failUpdate = updateCalls.find(
      (c) => c.data && c.data.refresh_failures === 2
    );
    expect(failUpdate).toBeDefined();

    consoleSpy.mockRestore();
  });
});
