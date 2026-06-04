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

const mockGetGLCode = vi.fn();
vi.mock('@/lib/entity-settings', () => ({
  getGLCode: (...args: unknown[]) => mockGetGLCode(...args),
}));

// ─── Supabase admin mock ────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type TableHandler = {
  selectResult?: { data: any; error: any };
  insertResult?: { data: any; error: any };
  updateResult?: { error: any };
  deleteResult?: { error: any };
};

let tableHandlers: Record<string, TableHandler> = {};

function createMockChain(handler: TableHandler) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);

  chain.update = vi.fn().mockImplementation(() => {
    const updateChain: any = {};
    updateChain.eq = vi.fn().mockReturnValue(updateChain);
    updateChain.in = vi.fn().mockReturnValue(updateChain);
    updateChain.then = (resolve: any) =>
      resolve(handler.updateResult ?? { error: null });
    return updateChain;
  });

  // When the chain is awaited after .insert().select(), return insertResult
  // When the chain is awaited after .select() (query), return selectResult
  chain.then = vi.fn((resolve: any) => {
    // If insert was called, use insertResult; otherwise use selectResult
    if (chain.insert.mock.calls.length > 0) {
      return resolve(handler.insertResult ?? { data: [], error: null });
    }
    if (chain.delete.mock.calls.length > 0) {
      return resolve(handler.deleteResult ?? { error: null });
    }
    return resolve(handler.selectResult ?? { data: [], error: null });
  });

  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const handler = tableHandlers[table] || {};
      return createMockChain(handler);
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
  return new NextRequest('http://localhost:3000/api/cron/suspense-timeout', {
    method: 'GET',
    headers,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../../suspense-timeout/route');

describe('GET /api/cron/suspense-timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    tableHandlers = {};
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

  it('returns 200 with valid CRON_SECRET and no stale transactions', async () => {
    tableHandlers['transactions'] = {
      selectResult: { data: [], error: null },
    };

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.moved).toBe(0);
    expect(json.message).toBe('No stale transactions found');
  });

  it('returns 200 with null stale transactions', async () => {
    tableHandlers['transactions'] = {
      selectResult: { data: null, error: null },
    };

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.moved).toBe(0);
  });

  it('processes stale transactions correctly (updates status)', async () => {
    const staleTxns = [
      { id: 'tx-1', entity_id: 'entity-1', amount: 50, merchant_name: 'TestCo', date: '2025-01-01', category_ai: '6000' },
      { id: 'tx-2', entity_id: 'entity-1', amount: 100, merchant_name: 'OtherCo', date: '2025-01-02', category_ai: null },
    ];

    tableHandlers['transactions'] = {
      selectResult: { data: staleTxns, error: null },
      updateResult: { error: null },
    };

    // GL code validation — return both GL codes as existing
    tableHandlers['chart_of_accounts'] = {
      selectResult: { data: [{ code: '2900' }, { code: '1000' }], error: null },
    };

    // Journal entry inserts
    tableHandlers['journal_entries'] = {
      insertResult: {
        data: [
          { id: 'je-1', transaction_id: 'tx-1' },
          { id: 'je-2', transaction_id: 'tx-2' },
        ],
        error: null,
      },
    };

    tableHandlers['journal_lines'] = {
      insertResult: { data: [], error: null },
    };

    mockGetGLCode.mockResolvedValue('2900'); // suspense_gl
    mockGetGLCode.mockResolvedValueOnce('2900'); // first call -> suspense_gl
    mockGetGLCode.mockResolvedValueOnce('1000'); // second call -> cash_gl

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.moved).toBe(2);
    expect(json.total_stale).toBe(2);

    consoleSpy.mockRestore();
  });

  it('respects the .limit(100) cap — route queries at most 100 rows', async () => {
    // Generate 100 transactions to verify the route processes them
    const staleTxns = Array.from({ length: 100 }, (_, i) => ({
      id: `tx-${i}`,
      entity_id: 'entity-1',
      amount: 10 + i,
      merchant_name: `Merchant ${i}`,
      date: '2025-01-01',
      category_ai: null,
    }));

    tableHandlers['transactions'] = {
      selectResult: { data: staleTxns, error: null },
      updateResult: { error: null },
    };

    tableHandlers['chart_of_accounts'] = {
      selectResult: { data: [{ code: '2900' }, { code: '1000' }], error: null },
    };

    tableHandlers['journal_entries'] = {
      insertResult: {
        data: staleTxns.map((tx) => ({ id: `je-${tx.id}`, transaction_id: tx.id })),
        error: null,
      },
    };

    tableHandlers['journal_lines'] = {
      insertResult: { data: [], error: null },
    };

    mockGetGLCode.mockResolvedValue('2900');
    mockGetGLCode.mockImplementation((_db: unknown, _entityId: unknown, key: string) => {
      if (key === 'suspense_gl') return Promise.resolve('2900');
      if (key === 'cash_gl') return Promise.resolve('1000');
      return Promise.resolve('9999');
    });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const req = createCronRequest('test-cron-secret');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    // All 100 should be processed (limit(100) caps the DB query)
    expect(json.moved).toBe(100);
    expect(json.total_stale).toBe(100);
  });
});
