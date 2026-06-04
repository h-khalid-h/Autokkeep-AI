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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

const mockPushApproved = vi.fn();
vi.mock('@/lib/ledger/auto-push', () => ({
  pushApprovedTransactionsToLedger: (...args: unknown[]) => mockPushApproved(...args),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createCronRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) {
    headers['authorization'] = `Bearer ${secret}`;
  }
  return new NextRequest('http://localhost:3000/api/cron/ledger-sync', {
    method: 'GET',
    headers,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../../ledger-sync/route');

describe('GET /api/cron/ledger-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
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

  it('returns 401 when CRON_SECRET env is not set', async () => {
    delete process.env.CRON_SECRET;
    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns success with sync results when ledger push succeeds', async () => {
    mockPushApproved.mockResolvedValue({
      pushed: 5,
      failed: 0,
      skipped: 2,
      errors: [],
    });

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.pushed).toBe(5);
    expect(json.failed).toBe(0);
    expect(json.skipped).toBe(2);
    expect(json.errors).toEqual([]);
  });

  it('handles partial failures from pushApprovedTransactionsToLedger', async () => {
    mockPushApproved.mockResolvedValue({
      pushed: 3,
      failed: 2,
      skipped: 0,
      errors: [
        { transactionId: 'txn-1', error: 'QuickBooks API error' },
        { transactionId: 'txn-2', error: 'Xero timeout' },
      ],
    });

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.pushed).toBe(3);
    expect(json.failed).toBe(2);
    expect(json.errors).toHaveLength(2);
  });

  it('returns 500 when pushApprovedTransactionsToLedger throws', async () => {
    mockPushApproved.mockRejectedValue(new Error('Database connection failed'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Ledger sync cron failed');

    consoleSpy.mockRestore();
  });

  it('returns success with zero pushed when nothing to sync', async () => {
    mockPushApproved.mockResolvedValue({
      pushed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    });

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.pushed).toBe(0);
  });
});
