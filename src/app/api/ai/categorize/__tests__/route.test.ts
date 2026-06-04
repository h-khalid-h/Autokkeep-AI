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
  categorizeTransaction: vi.fn().mockResolvedValue({
    glCode: '5000',
    confidence: 92,
    reasoning: 'Matched vendor pattern',
    engine: 'rule',
    ruleMatchType: 'exact',
    sourceHash: 'abc123',
  }),
}));

vi.mock('@/lib/ai/confidence', () => ({
  triageTransaction: vi.fn().mockReturnValue({
    decision: 'auto_commit',
    targetStatus: 'approved',
    confidence: { compositeScore: 0.92 },
    notificationChannel: null,
  }),
}));

vi.mock('@/lib/ai/privacy-parser', () => ({
  generateCitationToken: vi.fn().mockReturnValue('citation-tok-1'),
}));

vi.mock('@/lib/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validation')>();
  return { ...actual };
});

const mockDb = { from: vi.fn() };

const mockAuthContext = {
  user: { id: 'user-1', email: 'user@example.com' },
  membership: { id: 'tm-1', org_id: 'org-1', role: 'owner' },
  db: mockDb,
  entityIds: ['entity-1'],
  error: null as NextResponse | null,
};

vi.mock('@/lib/api-auth', () => ({
  getApiAuthContext: vi.fn().mockResolvedValue(mockAuthContext),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

const ENTITY_ID = 'a0000000-0000-4000-8000-000000000010';

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/ai/categorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
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

const validBody = {
  transaction: {
    id: 'txn-1',
    merchant: 'Acme Corp',
    amount: 150.00,
    date: '2026-01-15',
  },
  entityId: ENTITY_ID,
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');
const { categorizeTransaction } = await import('@/lib/ai/categorizer');

describe('POST /api/ai/categorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest(validBody);
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('should return 400 for missing transaction data', async () => {
    const req = createPostRequest({ entityId: ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  // ── Entity ownership ─────────────────────────────────────────────────────

  it('should return 403 when entity not found or access denied', async () => {
    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createPostRequest(validBody);
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  // ── Successful categorization ─────────────────────────────────────────────

  it('should categorize a transaction successfully', async () => {
    const entityChain = createChainMock({
      data: { id: ENTITY_ID, org_id: 'org-1' },
      error: null,
    });
    const coaChain = createChainMock({
      data: [{ code: '5000', name: 'Operating Expenses' }],
      error: null,
    });
    const rulesChain = createChainMock({ data: [], error: null });
    const historyChain = createChainMock({ data: [], error: null });
    const docAnchorChain = createChainMock({ data: [], error: null });
    const updateChain = createChainMock({ data: null, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'chart_of_accounts') return coaChain;
      if (table === 'categorization_rules') return rulesChain;
      if (table === 'categorization_history') return historyChain;
      if (table === 'document_anchors') return docAnchorChain;
      if (table === 'transactions') return updateChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest(validBody);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.glCode).toBe('5000');
    expect(json.confidence).toBe(92);
    expect(json.triage).toBeDefined();
    expect(json.triage.decision).toBe('auto_commit');
    expect(json.citationToken).toBe('citation-tok-1');

    expect(categorizeTransaction).toHaveBeenCalled();
  });

  // ── AI failure handling ───────────────────────────────────────────────────

  it('should return 500 when categorization throws', async () => {
    const entityChain = createChainMock({
      data: { id: ENTITY_ID, org_id: 'org-1' },
      error: null,
    });
    const coaChain = createChainMock({ data: [], error: null });
    const rulesChain = createChainMock({ data: [], error: null });
    const historyChain = createChainMock({ data: [], error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'chart_of_accounts') return coaChain;
      if (table === 'categorization_rules') return rulesChain;
      if (table === 'categorization_history') return historyChain;
      return createChainMock({ data: null, error: null });
    });

    (categorizeTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('OpenAI API timeout')
    );

    const req = createPostRequest(validBody);
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Categorization failed');
  });
});
