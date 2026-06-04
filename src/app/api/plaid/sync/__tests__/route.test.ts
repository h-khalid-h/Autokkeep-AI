import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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
  ingestTransactions: mockIngestTransactions,
}));

const mockCategorizeTransaction = vi.fn();

vi.mock('@/lib/ai/categorizer', () => ({
  categorizeTransaction: mockCategorizeTransaction,
}));

vi.mock('@/lib/ai/confidence', () => ({
  triageTransaction: vi.fn().mockReturnValue({
    decision: 'auto_approve',
    targetStatus: 'approved',
    confidence: { compositeScore: 0.92 },
  }),
}));

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

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/plaid/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

const VALID_CONNECTION_ID = 'a0000000-0000-4000-8000-000000000001';
const VALID_ENTITY_ID = 'b0000000-0000-4000-8000-000000000001';

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('POST /api/plaid/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ connectionId: VALID_CONNECTION_ID });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 403 when entity access is denied', async () => {
    const connectionChain = createChainMock({
      data: {
        id: VALID_CONNECTION_ID,
        entity_id: VALID_ENTITY_ID,
        plaid_access_token: 'access-plaid-xxx',
        institution_name: 'Chase',
        cursor: null,
        status: 'active',
        last_synced_at: null,
      },
      error: null,
    });
    const entityChain = createChainMock({ data: null, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'bank_connections') return connectionChain;
      if (table === 'entities') return entityChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ connectionId: VALID_CONNECTION_ID, entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('access denied');
  });

  it('should sync transactions successfully', async () => {
    const connectionChain = createChainMock({
      data: {
        id: VALID_CONNECTION_ID,
        entity_id: VALID_ENTITY_ID,
        plaid_access_token: 'access-plaid-xxx',
        institution_name: 'Chase',
        cursor: null,
        status: 'active',
        last_synced_at: null,
      },
      error: null,
    });
    const entityChain = createChainMock({
      data: { id: VALID_ENTITY_ID, org_id: 'org-1' },
      error: null,
    });
    // After ingest: no pending uncategorized txns
    const pendingChain = createChainMock({ data: [], error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'bank_connections') return connectionChain;
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return pendingChain;
      return createChainMock({ data: null, error: null });
    });

    mockIngestTransactions.mockResolvedValue({ added: 5, modified: 1, removed: 0 });

    const req = createPostRequest({ connectionId: VALID_CONNECTION_ID, entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.added).toBe(5);
    expect(json.modified).toBe(1);
    expect(json.removed).toBe(0);
    expect(json.categorized).toBe(0);
    expect(mockIngestTransactions).toHaveBeenCalledTimes(1);
  });

  it('should return 404 when bank connection is not found', async () => {
    const connectionChain = createChainMock({ data: null, error: { message: 'Not found' } });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'bank_connections') return connectionChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ connectionId: VALID_CONNECTION_ID, entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('not found');
  });

  it('should return 500 when ingest throws', async () => {
    const connectionChain = createChainMock({
      data: {
        id: VALID_CONNECTION_ID,
        entity_id: VALID_ENTITY_ID,
        plaid_access_token: 'access-plaid-xxx',
        institution_name: 'Chase',
        cursor: null,
        status: 'active',
        last_synced_at: null,
      },
      error: null,
    });
    const entityChain = createChainMock({
      data: { id: VALID_ENTITY_ID, org_id: 'org-1' },
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'bank_connections') return connectionChain;
      if (table === 'entities') return entityChain;
      return createChainMock({ data: null, error: null });
    });

    mockIngestTransactions.mockRejectedValue(new Error('Plaid API failure'));

    const req = createPostRequest({ connectionId: VALID_CONNECTION_ID, entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Failed to sync');
  });
});
