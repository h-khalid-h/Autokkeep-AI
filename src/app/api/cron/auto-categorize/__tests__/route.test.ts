import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock Sentry
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

// Mock audit log
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock AI categorizer
const mockBatchCategorize = vi.fn().mockResolvedValue(new Map());
vi.mock('@/lib/ai/categorizer', () => ({
  batchCategorize: mockBatchCategorize,
}));

// Mock Supabase admin client
const mockFrom = vi.fn();
const mockAdminSupabase = { from: mockFrom };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdminSupabase),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/auto-categorize', {
    method: 'POST',
    headers,
  });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');

describe('POST /api/cron/auto-categorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('should return 401 without authorization header', async () => {
    const req = createRequest();
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 401 with wrong CRON_SECRET', async () => {
    const req = createRequest({ authorization: 'Bearer wrong-secret' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 401 when CRON_SECRET env is not set', async () => {
    delete process.env.CRON_SECRET;

    const req = createRequest({ authorization: 'Bearer something' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── No transactions to process ────────────────────────────────────────────

  it('should return 200 with 0 processed when no uncategorized transactions', async () => {
    const txChain = createChainMock({ data: [], error: null });
    mockFrom.mockReturnValue(txChain);

    const req = createRequest({ authorization: 'Bearer test-cron-secret' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(json.message).toContain('No uncategorized');
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('should process uncategorized transactions with valid secret', async () => {
    const mockTxs = [
      { id: 'txn-1', entity_id: 'entity-1', merchant_name: 'Acme', amount: 50, date: '2024-01-01', mcc_code: null, currency: 'USD' },
      { id: 'txn-2', entity_id: 'entity-1', merchant_name: 'Beta Corp', amount: 100, date: '2024-01-02', mcc_code: null, currency: 'USD' },
    ];

    // Mock batchCategorize results
    const categorizeResults = new Map([
      ['txn-1', { glCode: '5000', glName: 'Office Supplies', confidence: 92, reasoning: 'Rule match' }],
      ['txn-2', { glCode: '6000', glName: 'Travel', confidence: 60, reasoning: 'Low confidence' }],
    ]);
    mockBatchCategorize.mockResolvedValue(categorizeResults);

    const txChain = createChainMock({ data: mockTxs, error: null });
    const rulesChain = createChainMock({ data: [], error: null });
    const chartChain = createChainMock({ data: [{ code: '5000', name: 'Office Supplies' }, { code: '6000', name: 'Travel' }], error: null });
    const historyChain = createChainMock({ data: [], error: null });
    const updateChain = createChainMock({ data: null, error: null });
    const auditChain = createChainMock({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'transactions') return txChain;
      if (table === 'categorization_rules') return rulesChain;
      if (table === 'chart_of_accounts') return chartChain;
      if (table === 'categorization_history') return historyChain;
      if (table === 'audit_log') return auditChain;
      return updateChain;
    });

    const req = createRequest({ authorization: 'Bearer test-cron-secret' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(2);
    expect(json.auto_categorized).toBe(1); // txn-1 at 92% > 80 threshold
    expect(json.human_review).toBe(1); // txn-2 at 60% < 80 threshold
  });

  // ── DB error ──────────────────────────────────────────────────────────────

  it('should return 500 on database error', async () => {
    const txChain = createChainMock({ data: null, error: { message: 'DB error' } });
    mockFrom.mockReturnValue(txChain);

    const req = createRequest({ authorization: 'Bearer test-cron-secret' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Failed to fetch');
  });
});
