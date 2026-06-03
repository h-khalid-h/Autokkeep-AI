import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────────

// Mock rate limiter — always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
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

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/portfolio');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
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
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/portfolio
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/portfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return empty entities and summary when no entities exist', async () => {
    const entityChain = createChainMock({ data: [], error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.entities).toEqual([]);
    expect(json.summary).toBeDefined();
    expect(json.summary.totalEntities).toBe(0);
    expect(json.summary.totalTransactions).toBe(0);
    expect(json.summary.avgAbr).toBe(0);
  });

  it('should return empty entities when entity query errors', async () => {
    const entityChain = createChainMock({ data: null, error: { message: 'DB error' } });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.entities).toEqual([]);
    expect(json.summary.totalEntities).toBe(0);
  });

  it('should return full portfolio data on happy path', async () => {
    const entities = [
      { id: 'a0000000-0000-4000-8000-000000000010', name: 'Entity Alpha', base_currency: 'USD' },
      { id: 'a0000000-0000-4000-8000-000000000020', name: 'Entity Beta', base_currency: 'EUR' },
    ];

    const transactions = [
      // Entity Alpha: 2 approved, 1 pending
      { entity_id: 'a0000000-0000-4000-8000-000000000010', status: 'approved', confidence: 95 },
      { entity_id: 'a0000000-0000-4000-8000-000000000010', status: 'approved', confidence: 90 },
      { entity_id: 'a0000000-0000-4000-8000-000000000010', status: 'pending', confidence: null },
      // Entity Beta: 1 synced, 1 human_review
      { entity_id: 'a0000000-0000-4000-8000-000000000020', status: 'synced', confidence: 98 },
      { entity_id: 'a0000000-0000-4000-8000-000000000020', status: 'human_review', confidence: 40 },
    ];

    const bankConnections = [
      { entity_id: 'a0000000-0000-4000-8000-000000000010', status: 'active', last_synced_at: '2024-06-01T12:00:00Z' },
    ];

    const ledgerConnections = [
      { entity_id: 'a0000000-0000-4000-8000-000000000020', is_active: true },
    ];

    const entityChain = createChainMock({ data: entities, error: null });
    const txnChain = createChainMock({ data: transactions, error: null });
    const bankChain = createChainMock({ data: bankConnections, error: null });
    const ledgerChain = createChainMock({ data: ledgerConnections, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txnChain;
      if (table === 'bank_connections') return bankChain;
      if (table === 'ledger_connections') return ledgerChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    // Entities
    expect(json.entities).toHaveLength(2);

    // Entity Alpha stats
    const alpha = json.entities.find((e: { entityId: string }) => e.entityId === 'a0000000-0000-4000-8000-000000000010');
    expect(alpha).toBeDefined();
    expect(alpha.entityName).toBe('Entity Alpha');
    expect(alpha.currency).toBe('USD');
    expect(alpha.totalTransactions).toBe(3);
    expect(alpha.pendingExceptions).toBe(1); // 1 pending
    expect(alpha.abr).toBe(67); // 2 resolved / 3 total = 67%
    expect(alpha.bankStatus).toBe('connected');
    expect(alpha.lastSync).toBe('2024-06-01T12:00:00Z');
    expect(alpha.ledgerStatus).toBe('disconnected');

    // Entity Beta stats
    const beta = json.entities.find((e: { entityId: string }) => e.entityId === 'a0000000-0000-4000-8000-000000000020');
    expect(beta).toBeDefined();
    expect(beta.entityName).toBe('Entity Beta');
    expect(beta.currency).toBe('EUR');
    expect(beta.totalTransactions).toBe(2);
    expect(beta.pendingExceptions).toBe(1); // 1 human_review
    expect(beta.abr).toBe(50); // 1 synced / 2 total = 50%
    expect(beta.bankStatus).toBe('disconnected');
    expect(beta.ledgerStatus).toBe('connected');

    // Summary
    expect(json.summary).toBeDefined();
    expect(json.summary.totalEntities).toBe(2);
    expect(json.summary.totalTransactions).toBe(5);
    expect(json.summary.totalPending).toBe(2);
    expect(json.summary.connectedBanks).toBe(1);
    expect(json.summary.connectedLedgers).toBe(1);
    // avgAbr = (67 + 50) / 2 = 58.5 → rounded to 59
    expect(json.summary.avgAbr).toBe(59);
  });

  it('should handle entities with no transactions', async () => {
    const entities = [
      { id: 'a0000000-0000-4000-8000-000000000010', name: 'Empty Entity', base_currency: 'USD' },
    ];

    const entityChain = createChainMock({ data: entities, error: null });
    const txnChain = createChainMock({ data: [], error: null });
    const bankChain = createChainMock({ data: [], error: null });
    const ledgerChain = createChainMock({ data: [], error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'transactions') return txnChain;
      if (table === 'bank_connections') return bankChain;
      if (table === 'ledger_connections') return ledgerChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.entities).toHaveLength(1);
    const entity = json.entities[0];
    expect(entity.totalTransactions).toBe(0);
    expect(entity.pendingExceptions).toBe(0);
    expect(entity.abr).toBe(0);
    expect(entity.closeReadiness).toBe(100); // No pending = 100%
    expect(entity.bankStatus).toBe('disconnected');
    expect(entity.ledgerStatus).toBe('disconnected');
  });

  it('should return 500 on unexpected error', async () => {
    // Force db.from to throw
    mockDb.from.mockImplementation(() => {
      throw new Error('Database connection lost');
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to load portfolio data');
  });
});
