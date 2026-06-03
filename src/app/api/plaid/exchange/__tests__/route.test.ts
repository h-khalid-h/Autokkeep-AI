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

vi.mock('@/lib/billing/plans', () => ({
  checkPlanLimits: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/crypto', () => ({
  encryptToken: vi.fn((t: string) => `encrypted_${t}`),
}));

vi.mock('@/lib/validation', () => ({
  parseBody: vi.fn(),
  schemas: { plaidExchange: {} },
}));

vi.mock('@/lib/plaid/client', () => ({
  exchangePublicToken: vi.fn().mockResolvedValue({
    accessToken: 'access-token-123',
    itemId: 'item-id-123',
  }),
  getAccounts: vi.fn().mockResolvedValue([
    {
      account_id: 'acct-1',
      name: 'Checking',
      type: 'depository',
      subtype: 'checking',
      mask: '1234',
      balances: { current: 1000, available: 900 },
    },
  ]),
  getInstitution: vi.fn().mockResolvedValue({ name: 'Test Bank' }),
  syncTransactions: vi.fn().mockResolvedValue({
    added: [],
    modified: [],
    removed: [],
    nextCursor: 'cursor-abc',
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
  return new NextRequest('http://localhost:3000/api/plaid/exchange', {
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
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
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
const { parseBody } = await import('@/lib/validation');
const { checkPlanLimits } = await import('@/lib/billing/plans');

describe('POST /api/plaid/exchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ publicToken: 'public-token', entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 400 for validation failure', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: NextResponse.json(
        { error: 'Validation failed', details: [{ field: 'publicToken', message: 'Required' }] },
        { status: 400 },
      ),
    });

    const req = createPostRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('should return 403 when entity not found or access denied', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        publicToken: 'public-token',
        entityId: 'a0000000-0000-4000-8000-000000000099',
        institutionId: 'ins_1',
      },
    });

    const entityChain = createChainMock({ data: null, error: null });
    mockDb.from.mockReturnValue(entityChain);

    const req = createPostRequest({ publicToken: 'public-token', entityId: 'a0000000-0000-4000-8000-000000000099' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Entity not found or access denied');
  });

  it('should return 403 when plan limits exceeded', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        publicToken: 'public-token',
        entityId: 'a0000000-0000-4000-8000-000000000010',
      },
    });

    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003' },
      error: null,
    });
    mockDb.from.mockReturnValue(entityChain);

    (checkPlanLimits as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      reason: 'Plan limit reached',
      currentPlan: 'free',
    });

    const req = createPostRequest({ publicToken: 'public-token', entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Plan limit reached');
    expect(json.plan).toBe('free');
  });

  it('should exchange token and return connection (happy path)', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        publicToken: 'public-token-xyz',
        entityId: 'a0000000-0000-4000-8000-000000000010',
        institutionId: 'ins_1',
      },
    });

    (checkPlanLimits as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: true });

    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003' },
      error: null,
    });

    const connectionChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000020' },
      error: null,
    });

    const accountsInsertChain = createChainMock({ data: null, error: null });
    const savedAccountsChain = createChainMock({
      data: [{ id: 'ba-1', plaid_account_id: 'acct-1' }],
      error: null,
    });
    const updateConnectionChain = createChainMock({ data: null, error: null });
    const upsertChain = createChainMock({ data: null, error: null });

    let bankConnectionCallCount = 0;
    let bankAccountCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'bank_connections') {
        bankConnectionCallCount++;
        if (bankConnectionCallCount === 1) return connectionChain; // insert
        return updateConnectionChain; // update cursor
      }
      if (table === 'bank_accounts') {
        bankAccountCallCount++;
        if (bankAccountCallCount === 1) return accountsInsertChain; // insert
        return savedAccountsChain; // select saved
      }
      if (table === 'transactions') return upsertChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ publicToken: 'public-token-xyz', entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.connectionId).toBe('a0000000-0000-4000-8000-000000000020');
    expect(json.accounts).toHaveLength(1);
    expect(json.accounts[0].name).toBe('Checking');
  });

  it('should return 500 when connection insert fails', async () => {
    (parseBody as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        publicToken: 'public-token-xyz',
        entityId: 'a0000000-0000-4000-8000-000000000010',
      },
    });

    (checkPlanLimits as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: true });

    const entityChain = createChainMock({
      data: { id: 'a0000000-0000-4000-8000-000000000010', org_id: 'a0000000-0000-4000-8000-000000000003' },
      error: null,
    });

    const connectionChain = createChainMock({
      data: null,
      error: { message: 'DB insert error' },
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'bank_connections') return connectionChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ publicToken: 'pt', entityId: 'a0000000-0000-4000-8000-000000000010' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to save bank connection');
  });
});
