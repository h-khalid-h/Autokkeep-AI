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

const mockIngestTransactions = vi.fn();
vi.mock('@/lib/plaid/ingest', () => ({
  ingestTransactions: (...args: unknown[]) => mockIngestTransactions(...args),
}));

// ─── Supabase admin mock ────────────────────────────────────────────────────────

let mockFromResult: unknown = { data: [], error: null };

const mockChain: Record<string, ReturnType<typeof vi.fn>> = {};
mockChain.select = vi.fn().mockReturnValue(mockChain);
mockChain.eq = vi.fn().mockReturnValue(mockChain);
mockChain.then = vi.fn((resolve: (v: unknown) => void) => resolve(mockFromResult));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue(mockChain),
  })),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createCronRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) {
    headers['authorization'] = `Bearer ${secret}`;
  }
  return new NextRequest('http://localhost:3000/api/cron/plaid-sync', {
    method: 'GET',
    headers,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../../plaid-sync/route');

describe('GET /api/cron/plaid-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    mockFromResult = { data: [], error: null };
  });

  it('returns 401 without CRON_SECRET header', async () => {
    const req = createCronRequest(); // no auth header
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

  it('returns 200 with valid CRON_SECRET and empty connections', async () => {
    mockFromResult = { data: [], error: null };

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.synced).toBe(0);
    expect(json.failed).toBe(0);
    expect(json.message).toBe('No active bank connections found');
  });

  it('returns 200 with null connections list', async () => {
    mockFromResult = { data: null, error: null };

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.synced).toBe(0);
  });

  it('reports sync results correctly on success', async () => {
    const connections = [
      { id: 'conn-1', entity_id: 'entity-1', plaid_item_id: 'item-1', plaid_access_token: 'tok-1', cursor: null, institution_name: 'Chase', status: 'active' },
      { id: 'conn-2', entity_id: 'entity-2', plaid_item_id: 'item-2', plaid_access_token: 'tok-2', cursor: null, institution_name: 'BoA', status: 'active' },
    ];
    mockFromResult = { data: connections, error: null };
    mockIngestTransactions.mockResolvedValue(undefined);

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.synced).toBe(2);
    expect(json.failed).toBe(0);
    expect(json.total).toBe(2);
    expect(json.errors).toEqual([]);
  });

  it('handles partial failures (some connections fail)', async () => {
    const connections = [
      { id: 'conn-ok', entity_id: 'entity-1', plaid_item_id: 'item-1', plaid_access_token: 'tok-1', cursor: null, institution_name: 'Chase', status: 'active' },
      { id: 'conn-fail', entity_id: 'entity-2', plaid_item_id: 'item-2', plaid_access_token: 'tok-2', cursor: null, institution_name: 'BoA', status: 'active' },
    ];
    mockFromResult = { data: connections, error: null };

    mockIngestTransactions
      .mockResolvedValueOnce(undefined) // conn-ok succeeds
      .mockRejectedValueOnce(new Error('Plaid API timeout')); // conn-fail fails

    // Suppress console.error from the route
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.synced).toBe(1);
    expect(json.failed).toBe(1);
    expect(json.total).toBe(2);
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].connectionId).toBe('conn-fail');
    expect(json.errors[0].error).toBe('Plaid API timeout');

    consoleSpy.mockRestore();
  });
});
