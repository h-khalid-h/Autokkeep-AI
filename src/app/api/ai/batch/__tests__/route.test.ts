import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ai/categorizer', () => ({
  batchCategorize: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('@/lib/ai/confidence', () => ({
  triageTransaction: vi.fn().mockReturnValue({
    decision: 'auto_commit',
    targetStatus: 'approved',
    confidence: { compositeScore: 0.95 },
  }),
}));

vi.mock('@/lib/ai/privacy-parser', () => ({
  generateCitationToken: vi.fn().mockReturnValue('citation-tok-1'),
}));

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

vi.mock('@/lib/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validation')>();
  return { ...actual };
});

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/ai/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');
const { batchCategorize } = await import('@/lib/ai/categorizer');

describe('POST /api/ai/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
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

  it('should return 400 for missing entityId', async () => {
    const req = createPostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 for invalid entityId (not UUID)', async () => {
    const req = createPostRequest({ entityId: 'not-a-uuid' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 403 when entity not found or access denied', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return empty summary when no pending transactions', async () => {
    const entityChain = createChainMock({ data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003' }, error: null });
    const txChain = createChainMock({ data: [], error: null });

    let _entityCalls = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') { _entityCalls++; return entityChain; }
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(json.auto_approved).toBe(0);
    expect(json.flagged_for_review).toBe(0);
    expect(json.failed).toBe(0);
  });

  it('should return 500 when transaction fetch fails', async () => {
    const entityChain = createChainMock({ data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003' }, error: null });
    const txChain = createChainMock({ data: null, error: { message: 'DB error' } });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch transactions');
  });

  it('should process batch and return summary on happy path', async () => {
    const txId1 = 'a0000000-0000-4000-8000-000000000020';
    const txId2 = 'a0000000-0000-4000-8000-000000000021';
    const entityId = 'a0000000-0000-4000-8000-000000000010';

    const entityChain = createChainMock({ data: { id: entityId, org_id: 'a0000000-0000-4000-8000-000000000003' }, error: null });
    const txChain = createChainMock({
      data: [
        { id: txId1, entity_id: entityId, merchant_name: 'Acme', merchant_raw: 'ACME CORP', amount: 100, date: '2026-01-01', mcc: null, currency: 'USD', card_holder: null },
        { id: txId2, entity_id: entityId, merchant_name: 'Globex', merchant_raw: 'GLOBEX INC', amount: 200, date: '2026-01-02', mcc: null, currency: 'USD', card_holder: null },
      ],
      error: null,
    });
    const coaChain = createChainMock({ data: [{ code: '5000', name: 'Expenses' }], error: null });
    const rulesChain = createChainMock({ data: [], error: null });
    const historyChain = createChainMock({ data: [], error: null });
    const docAnchorChain = createChainMock({ data: [], error: null });
    const updateChain = createChainMock({ data: null, error: null });

    const batchResults = new Map();
    batchResults.set(txId1, { glCode: '5000', confidence: 90, reasoning: 'Matched vendor', ruleMatchType: 'exact', sourceHash: 'hash1' });
    batchResults.set(txId2, { glCode: '5000', confidence: 85, reasoning: 'Matched vendor', ruleMatchType: 'contains', sourceHash: 'hash2' });
    (batchCategorize as ReturnType<typeof vi.fn>).mockResolvedValue(batchResults);

    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') {
        txCallCount++;
        if (txCallCount === 1) return txChain; // fetch
        return updateChain; // updates
      }
      if (table === 'chart_of_accounts') return coaChain;
      if (table === 'categorization_rules') return rulesChain;
      if (table === 'categorization_history') return historyChain;
      if (table === 'document_anchors') return docAnchorChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ entityId });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(2);
    expect(json.auto_approved + json.flagged_for_review + json.failed).toBe(2);
  });
});
