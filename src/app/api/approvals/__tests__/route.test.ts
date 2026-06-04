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

// Mock approval module
const mockGetPendingApprovals = vi.fn();
const mockProcessApproval = vi.fn();
vi.mock('@/lib/approval', () => ({
  getPendingApprovals: (...args: unknown[]) => mockGetPendingApprovals(...args),
  processApproval: (...args: unknown[]) => mockProcessApproval(...args),
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

// Mock validation — let it use the real implementation so schema validation tests work
// (parseBody and schemas are NOT mocked; they use real zod validation)

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/approvals');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/approvals', {
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

const { GET, POST } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/approvals
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/approvals', () => {
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

  it('should return empty list when no entities', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockAuthContext,
      entityIds: [],
    });

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approvals).toEqual([]);
  });

  it('should return enriched approvals list', async () => {
    const pendingApprovals = [
      { id: 'apr-1', transaction_id: 'txn-1', status: 'pending' },
      { id: 'apr-2', transaction_id: 'txn-2', status: 'pending' },
    ];
    mockGetPendingApprovals.mockResolvedValue(pendingApprovals);

    const transactions = [
      { id: 'txn-1', merchant_name: 'Store A', amount: 100, currency: 'USD', status: 'pending', created_at: '2024-01-01' },
      { id: 'txn-2', merchant_name: 'Store B', amount: 200, currency: 'USD', status: 'pending', created_at: '2024-01-02' },
    ];
    const txnChain = createChainMock({ data: transactions, error: null });
    mockDb.from.mockReturnValue(txnChain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approvals).toHaveLength(2);
    expect(json.approvals[0].transaction).toBeDefined();
    expect(json.approvals[0].transaction.merchant_name).toBe('Store A');
    expect(json.approvals[1].transaction.merchant_name).toBe('Store B');
  });

  it('should handle approvals with no matching transactions', async () => {
    const pendingApprovals = [
      { id: 'apr-1', transaction_id: 'txn-missing', status: 'pending' },
    ];
    mockGetPendingApprovals.mockResolvedValue(pendingApprovals);

    const txnChain = createChainMock({ data: [], error: null });
    mockDb.from.mockReturnValue(txnChain);

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approvals).toHaveLength(1);
    expect(json.approvals[0].transaction).toBeNull();
  });

  it('should return 500 when getPendingApprovals throws', async () => {
    mockGetPendingApprovals.mockRejectedValue(new Error('DB error'));

    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch pending approvals');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/approvals
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ approvalId: 'a0000000-0000-4000-8000-000000000001', decision: 'approved' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 when approvalId is missing', async () => {
    const req = createPostRequest({ decision: 'approved' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 when decision is invalid', async () => {
    const req = createPostRequest({
      approvalId: 'a0000000-0000-4000-8000-000000000001',
      decision: 'maybe',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 400 when approvalId is not a valid UUID', async () => {
    const req = createPostRequest({
      approvalId: 'not-a-uuid',
      decision: 'approved',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should approve and return updated approval', async () => {
    const updatedApproval = {
      id: 'a0000000-0000-4000-8000-000000000001',
      status: 'approved',
      decided_by: mockAuthContext.user.id,
    };
    mockProcessApproval.mockResolvedValue(updatedApproval);

    const req = createPostRequest({
      approvalId: 'a0000000-0000-4000-8000-000000000001',
      decision: 'approved',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approval).toBeDefined();
    expect(json.approval.status).toBe('approved');
  });

  it('should reject and return updated approval', async () => {
    const updatedApproval = {
      id: 'a0000000-0000-4000-8000-000000000001',
      status: 'rejected',
      decided_by: mockAuthContext.user.id,
    };
    mockProcessApproval.mockResolvedValue(updatedApproval);

    const req = createPostRequest({
      approvalId: 'a0000000-0000-4000-8000-000000000001',
      decision: 'rejected',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approval).toBeDefined();
    expect(json.approval.status).toBe('rejected');
  });

  it('should return 400 when processApproval throws a validation error', async () => {
    mockProcessApproval.mockRejectedValue(new Error('Insufficient role'));

    const req = createPostRequest({
      approvalId: 'a0000000-0000-4000-8000-000000000001',
      decision: 'approved',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Insufficient role');
  });

  it('should return 400 for already processed approval', async () => {
    mockProcessApproval.mockRejectedValue(new Error('already processed'));

    const req = createPostRequest({
      approvalId: 'a0000000-0000-4000-8000-000000000001',
      decision: 'approved',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('already processed');
  });

  it('should return 500 when processApproval throws a non-validation error', async () => {
    mockProcessApproval.mockRejectedValue(new Error('Database connection lost'));

    const req = createPostRequest({
      approvalId: 'a0000000-0000-4000-8000-000000000001',
      decision: 'approved',
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to process approval');
  });
});
