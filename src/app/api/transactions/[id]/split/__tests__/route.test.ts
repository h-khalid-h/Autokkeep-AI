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

const MOCK_TXN_ID = '00000000-0000-4000-8000-000000000001';
const MOCK_ENTITY_ID = '00000000-0000-4000-8000-000000000010';
const MOCK_USER_ID = '00000000-0000-4000-8000-000000000020';
const MOCK_OTHER_ENTITY = '00000000-0000-4000-8000-000000000099';

const mockAuthContext = {
  user: { id: MOCK_USER_ID, email: 'user@example.com' },
  membership: { id: 'tm-1', org_id: 'org-1', role: 'owner' },
  db: mockDb,
  entityIds: [MOCK_ENTITY_ID],
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
  params: Promise.resolve({ id: MOCK_TXN_ID }),
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
  id: MOCK_TXN_ID,
  entity_id: MOCK_ENTITY_ID,
  bank_account_id: '00000000-0000-4000-8000-000000000030',
  merchant_name: 'Office Depot',
  merchant_raw: 'OFFICE DEPOT #1234',
  amount: 100.0,
  date: '2025-06-15',
  currency: 'USD',
  status: 'pending',
  is_split: false,
  deleted_at: null,
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');
const { writeAuditLog } = await import('@/lib/audit');

describe('POST /api/transactions/[id]/split', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('should split a $100 transaction into $60 + $40', async () => {
    // Fetch original transaction
    const fetchChain = createChainMock({ data: mockTransaction, error: null });
    // Update parent (mark as split)
    const updateChain = createChainMock({ data: null, error: null });
    // Insert children
    const child1 = { ...mockTransaction, id: 'child-1', amount: 60, parent_transaction_id: MOCK_TXN_ID, split_index: 1, category_human: '6000', status: 'approved' };
    const child2 = { ...mockTransaction, id: 'child-2', amount: 40, parent_transaction_id: MOCK_TXN_ID, split_index: 2, category_human: '6100', status: 'approved' };
    const insertChain = createChainMock({ data: [child1, child2], error: null });
    // Audit chain
    const auditChain = createChainMock({ data: null, error: null });

    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'transactions') {
        txCallCount++;
        if (txCallCount === 1) return fetchChain;   // fetch original
        if (txCallCount === 2) return updateChain;   // update parent
        return insertChain;                          // insert children
      }
      if (table === 'audit_log') return auditChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createRequest('POST', `/api/transactions/${MOCK_TXN_ID}/split`, {
      splits: [
        { amount: 60, glCode: '6000', glName: 'Office Supplies' },
        { amount: 40, glCode: '6100', glName: 'Equipment' },
      ],
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.splits).toHaveLength(2);
    expect(json.splits[0].amount).toBe(60);
    expect(json.splits[1].amount).toBe(40);

    // Verify audit log was called
    expect(writeAuditLog).toHaveBeenCalledOnce();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        targetType: 'transaction',
        targetId: MOCK_TXN_ID,
        details: expect.objectContaining({
          operation: 'split',
          splitCount: 2,
        }),
      }),
    );
  });

  // ── Validation: sum mismatch ──────────────────────────────────────────────

  it('should return 400 if split amounts do not sum to original', async () => {
    const fetchChain = createChainMock({ data: mockTransaction, error: null });
    mockDb.from.mockReturnValue(fetchChain);

    const req = createRequest('POST', `/api/transactions/${MOCK_TXN_ID}/split`, {
      splits: [
        { amount: 60, glCode: '6000', glName: 'Office Supplies' },
        { amount: 50, glCode: '6100', glName: 'Equipment' }, // 60+50=110 ≠ 100
      ],
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('must equal');
  });

  // ── Validation: minimum 2 splits ──────────────────────────────────────────

  it('should return 400 if fewer than 2 splits provided', async () => {
    const req = createRequest('POST', `/api/transactions/${MOCK_TXN_ID}/split`, {
      splits: [
        { amount: 100, glCode: '6000', glName: 'Office Supplies' },
      ],
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  // ── Validation: already split ─────────────────────────────────────────────

  it('should return 400 if transaction is already split', async () => {
    const alreadySplit = { ...mockTransaction, is_split: true };
    const fetchChain = createChainMock({ data: alreadySplit, error: null });
    mockDb.from.mockReturnValue(fetchChain);

    const req = createRequest('POST', `/api/transactions/${MOCK_TXN_ID}/split`, {
      splits: [
        { amount: 60, glCode: '6000', glName: 'Office Supplies' },
        { amount: 40, glCode: '6100', glName: 'Equipment' },
      ],
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('already been split');
  });

  // ── Validation: amounts must be positive ──────────────────────────────────

  it('should return 400 if any split amount is not positive', async () => {
    const req = createRequest('POST', `/api/transactions/${MOCK_TXN_ID}/split`, {
      splits: [
        { amount: -10, glCode: '6000', glName: 'Office Supplies' },
        { amount: 110, glCode: '6100', glName: 'Equipment' },
      ],
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('should return 400 if any split amount is zero', async () => {
    const req = createRequest('POST', `/api/transactions/${MOCK_TXN_ID}/split`, {
      splits: [
        { amount: 0, glCode: '6000', glName: 'Office Supplies' },
        { amount: 100, glCode: '6100', glName: 'Equipment' },
      ],
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  // ── Auth: unauthorized ────────────────────────────────────────────────────

  it('should return 401 for unauthorized request', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createRequest('POST', `/api/transactions/${MOCK_TXN_ID}/split`, {
      splits: [
        { amount: 60, glCode: '6000', glName: 'Office Supplies' },
        { amount: 40, glCode: '6100', glName: 'Equipment' },
      ],
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  // ── Entity access: wrong entity ───────────────────────────────────────────

  it('should return 403 when user has no entity access', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockAuthContext,
      entityIds: [],
    });

    const req = createRequest('POST', `/api/transactions/${MOCK_TXN_ID}/split`, {
      splits: [
        { amount: 60, glCode: '6000', glName: 'Office Supplies' },
        { amount: 40, glCode: '6100', glName: 'Equipment' },
      ],
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('entity');
  });

  it('should return 404 when transaction belongs to a different entity', async () => {
    // User has access to a different entity than the transaction's
    const _otherEntityTx = { ...mockTransaction, entity_id: MOCK_OTHER_ENTITY };
    // The .in('entity_id', entityIds) filter will cause .single() to return null
    const fetchChain = createChainMock({ data: null, error: { code: 'PGRST116' } });
    mockDb.from.mockReturnValue(fetchChain);

    const req = createRequest('POST', `/api/transactions/${MOCK_TXN_ID}/split`, {
      splits: [
        { amount: 60, glCode: '6000', glName: 'Office Supplies' },
        { amount: 40, glCode: '6100', glName: 'Equipment' },
      ],
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('not found');
  });

  // ── Edge case: invalid transaction ID ─────────────────────────────────────

  it('should return 400 for invalid transaction ID format', async () => {
    const badContext = { params: Promise.resolve({ id: 'not-a-uuid' }) };
    const req = createRequest('POST', '/api/transactions/not-a-uuid/split', {
      splits: [
        { amount: 60, glCode: '6000', glName: 'Office Supplies' },
        { amount: 40, glCode: '6100', glName: 'Equipment' },
      ],
    });
    const res = await POST(req, badContext);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid transaction ID');
  });

  // ── Edge case: three-way split ────────────────────────────────────────────

  it('should support a three-way split', async () => {
    const fetchChain = createChainMock({ data: mockTransaction, error: null });
    const updateChain = createChainMock({ data: null, error: null });
    const child1 = { id: 'c1', amount: 33.33, split_index: 1 };
    const child2 = { id: 'c2', amount: 33.33, split_index: 2 };
    const child3 = { id: 'c3', amount: 33.34, split_index: 3 };
    const insertChain = createChainMock({ data: [child1, child2, child3], error: null });
    const auditChain = createChainMock({ data: null, error: null });

    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'transactions') {
        txCallCount++;
        if (txCallCount === 1) return fetchChain;
        if (txCallCount === 2) return updateChain;
        return insertChain;
      }
      if (table === 'audit_log') return auditChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createRequest('POST', `/api/transactions/${MOCK_TXN_ID}/split`, {
      splits: [
        { amount: 33.33, glCode: '6000', glName: 'Office Supplies' },
        { amount: 33.33, glCode: '6100', glName: 'Equipment' },
        { amount: 33.34, glCode: '6200', glName: 'Software', description: 'SaaS tools' },
      ],
    });
    const res = await POST(req, mockRouteContext);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.splits).toHaveLength(3);
  });
});
