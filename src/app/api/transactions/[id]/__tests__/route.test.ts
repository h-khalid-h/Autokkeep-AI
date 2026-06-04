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

// Mock audit log
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock getApiAuthContext
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

function createRequest(method: string, url: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const mockRouteContext = {
  params: Promise.resolve({ id: 'txn-1' }),
};

/** Fluent chain builder for Supabase query mocks */
function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);

  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

const mockTransaction = {
  id: 'txn-1',
  entity_id: 'entity-1',
  merchant_name: 'Acme Corp',
  amount: 100.00,
  date: '2025-06-15',
  status: 'pending',
  category_ai: null,
  category_human: null,
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { GET, PUT, DELETE } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('/api/transactions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── GET ─────────────────────────────────────────────────────────────────────

  describe('GET', () => {
    it('should return 401 without auth', async () => {
      (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      });

      const req = createRequest('GET', '/api/transactions/txn-1');
      const res = await GET(req, mockRouteContext);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('should return 404 if no entities', async () => {
      (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockAuthContext,
        entityIds: [],
      });

      const req = createRequest('GET', '/api/transactions/txn-1');
      const res = await GET(req, mockRouteContext);

      expect(res.status).toBe(404);
    });

    it('should return transaction on success', async () => {
      const txChain = createChainMock({ data: mockTransaction, error: null });
      mockDb.from.mockReturnValue(txChain);

      const req = createRequest('GET', '/api/transactions/txn-1');
      const res = await GET(req, mockRouteContext);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.transaction).toEqual(mockTransaction);
    });

    it('should return 404 if transaction not found', async () => {
      const txChain = createChainMock({ data: null, error: { code: 'PGRST116' } });
      mockDb.from.mockReturnValue(txChain);

      const req = createRequest('GET', '/api/transactions/txn-999');
      const res = await GET(req, mockRouteContext);

      expect(res.status).toBe(404);
    });
  });

  // ── PUT ─────────────────────────────────────────────────────────────────────

  describe('PUT', () => {
    it('should return 401 without auth', async () => {
      (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      });

      const req = createRequest('PUT', '/api/transactions/txn-1', { status: 'approved' });
      const res = await PUT(req, mockRouteContext);

      expect(res.status).toBe(401);
    });

    it('should update transaction status', async () => {
      // existing transaction fetch
      const existingChain = createChainMock({ data: mockTransaction, error: null });
      // update result
      const updatedTx = { ...mockTransaction, status: 'human_review' };
      const updateChain = createChainMock({ data: updatedTx, error: null });
      // audit chain
      const auditChain = createChainMock({ data: null, error: null });

      let txCallCount = 0;
      mockDb.from.mockImplementation((table: string) => {
        if (table === 'transactions') {
          txCallCount++;
          // First call: fetch existing; second call: update
          return txCallCount === 1 ? existingChain : updateChain;
        }
        if (table === 'audit_log') return auditChain;
        return createChainMock({ data: null, error: null });
      });

      const req = createRequest('PUT', '/api/transactions/txn-1', { status: 'human_review' });
      const res = await PUT(req, mockRouteContext);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.transaction).toBeDefined();
    });

    it('should return 400 for invalid status transition', async () => {
      const syncedTx = { ...mockTransaction, status: 'synced' };
      const existingChain = createChainMock({ data: syncedTx, error: null });

      mockDb.from.mockImplementation((table: string) => {
        if (table === 'transactions') return existingChain;
        return createChainMock({ data: null, error: null });
      });

      const req = createRequest('PUT', '/api/transactions/txn-1', { status: 'pending' });
      const res = await PUT(req, mockRouteContext);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid status transition');
    });
  });

  // ── DELETE ──────────────────────────────────────────────────────────────────

  describe('DELETE', () => {
    it('should return 401 without auth', async () => {
      (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      });

      const req = createRequest('DELETE', '/api/transactions/txn-1');
      const res = await DELETE(req, mockRouteContext);

      expect(res.status).toBe(401);
    });

    it('should soft-delete a transaction', async () => {
      const entitiesChain = createChainMock({ data: [{ id: 'entity-1' }], error: null });
      const existingChain = createChainMock({ data: mockTransaction, error: null });
      const deleteChain = createChainMock({ data: null, error: null });
      const auditChain = createChainMock({ data: null, error: null });

      let txCallCount = 0;
      mockDb.from.mockImplementation((table: string) => {
        if (table === 'entities') return entitiesChain;
        if (table === 'transactions') {
          txCallCount++;
          return txCallCount === 1 ? existingChain : deleteChain;
        }
        if (table === 'audit_log') return auditChain;
        return createChainMock({ data: null, error: null });
      });

      const req = createRequest('DELETE', '/api/transactions/txn-1');
      const res = await DELETE(req, mockRouteContext);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
