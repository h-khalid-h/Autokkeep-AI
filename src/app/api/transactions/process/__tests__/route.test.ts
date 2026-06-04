import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock Sentry
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

// Mock ingest
vi.mock('@/lib/plaid/ingest', () => ({
  ingestTransactions: vi.fn().mockResolvedValue({ added: 0, modified: 0, removed: 0 }),
}));

// Mock AI categorizer
vi.mock('@/lib/ai/categorizer', () => ({
  batchCategorize: vi.fn().mockResolvedValue(new Map()),
}));

// Mock billing
const mockCheckPlanLimits = vi.fn();
vi.mock('@/lib/billing/plans', () => ({
  checkPlanLimits: (...args: unknown[]) => mockCheckPlanLimits(...args),
}));

// Mock audit
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock confidence triage
vi.mock('@/lib/ai/confidence', () => ({
  triageTransaction: vi.fn().mockReturnValue({
    decision: 'auto_commit',
    targetStatus: 'approved',
    confidence: { compositeScore: 0.95 },
  }),
}));

// Mock getApiAuthContext
const mockDb = { from: vi.fn() };

const mockAuthContext = {
  user: { id: 'a0000000-0000-4000-8000-000000000001', email: 'user@example.com' },
  membership: { id: 'a0000000-0000-4000-8000-000000000002', org_id: 'a0000000-0000-4000-8000-000000000003', role: 'owner' },
  db: mockDb,
  entityIds: ['a0000000-0000-4000-8000-000000000010'],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/transactions/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/transactions/process
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/transactions/process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
    // Default: plan limits pass
    mockCheckPlanLimits.mockResolvedValue({ allowed: true });
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 when entityId is missing', async () => {
    const req = createPostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 when entityId is not a valid UUID', async () => {
    const req = createPostRequest({ entityId: 'not-a-uuid' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 403 when plan limits are exceeded', async () => {
    mockCheckPlanLimits.mockResolvedValue({
      allowed: false,
      reason: 'Transaction limit reached',
      currentPlan: 'free',
    });

    // Entity lookup still needed first — but planCheck happens before entity lookup
    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Transaction limit reached');
    expect(json.plan).toBe('free');
  });

  it('should return 403 when entity not found or access denied', async () => {
    // Entity lookup returns null
    const entityChain = createChainMock({ data: null, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return pipeline summary on happy path with no connections and no pending', async () => {
    // Entity lookup: found
    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003' },
      error: null,
    });
    // Bank connections: none
    const connChain = createChainMock({ data: [], error: null });
    // Pending transactions: none
    const txnChain = createChainMock({ data: [], error: null });

    let _fromCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'bank_connections') return connChain;
      if (table === 'transactions') {
        _fromCallCount++;
        return txnChain;
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    // Verify pipeline summary structure
    expect(json.sync).toBeDefined();
    expect(json.sync.connections_synced).toBe(0);
    expect(json.sync.transactions_added).toBe(0);
    expect(json.sync.errors).toEqual([]);

    expect(json.categorization).toBeDefined();
    expect(json.categorization.processed).toBe(0);
    expect(json.categorization.auto_approved).toBe(0);
    expect(json.categorization.flagged_for_review).toBe(0);
    expect(json.categorization.failed).toBe(0);
  });

  it('should return 500 on unexpected error', async () => {
    // Force an unexpected error by making plan check throw
    mockCheckPlanLimits.mockRejectedValue(new Error('Unexpected crash'));

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Pipeline processing failed');
  });
});
