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

vi.mock('@/lib/crypto', () => ({
  decryptToken: vi.fn((t: string) => `decrypted_${t}`),
  encryptToken: vi.fn((t: string) => `encrypted_${t}`),
}));

vi.mock('@/lib/billing/plans', () => ({
  checkPlanLimits: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/entity-settings', () => ({
  getGLCode: vi.fn().mockResolvedValue('1010'),
}));

const mockSyncJournalEntry = vi.fn();
const mockBuildJournalEntryFromTransaction = vi.fn();
const mockRefreshXeroToken = vi.fn();
const mockSyncChartOfAccounts = vi.fn();
const mockUpsertChartOfAccounts = vi.fn();

vi.mock('@/lib/ledger/sync', () => ({
  syncJournalEntry: mockSyncJournalEntry,
  syncChartOfAccounts: mockSyncChartOfAccounts,
  upsertChartOfAccounts: mockUpsertChartOfAccounts,
  buildJournalEntryFromTransaction: mockBuildJournalEntryFromTransaction,
  refreshXeroToken: mockRefreshXeroToken,
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

const VALID_ENTITY_ID = 'b0000000-0000-4000-8000-000000000001';
const VALID_TX_ID = 'c0000000-0000-4000-8000-000000000001';

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/ledger/xero/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/ledger/xero/sync');
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url, { method: 'GET' });
}

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

const { POST, GET } = await import('../route');
const { getApiAuthContext } = await import('@/lib/api-auth');

describe('POST /api/ledger/xero/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
    mockRefreshXeroToken.mockResolvedValue({
      accessToken: 'new-xero-access',
      refreshToken: 'new-xero-refresh',
      expiresIn: 1800,
    });
  });

  it('should return 401 without auth', async () => {
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = createPostRequest({ entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('should return 404 when no Xero connection exists', async () => {
    const entityChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const connChain = createChainMock({ data: null, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'ledger_connections') return connChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('No active Xero');
  });

  it('should sync entries successfully', async () => {
    const entityChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const connChain = createChainMock({
      data: {
        id: 'conn-1',
        entity_id: VALID_ENTITY_ID,
        access_token: 'enc_access',
        refresh_token: 'enc_refresh',
        tenant_id: 'tenant-123',
        token_expires_at: new Date(Date.now() + 1800000).toISOString(),
        is_active: true,
      },
      error: null,
    });
    const txListChain = createChainMock({
      data: [
        { id: VALID_TX_ID, entity_id: VALID_ENTITY_ID, date: '2025-01-15', merchant_name: 'Stripe', amount: 99, category_ai: '6200', category_human: null, currency: 'USD', gl_code: '6200', status: 'approved' },
      ],
      error: null,
    });
    const claimChain = createChainMock({
      data: [
        { id: VALID_TX_ID, entity_id: VALID_ENTITY_ID, date: '2025-01-15', merchant_name: 'Stripe', amount: 99, category_ai: '6200', category_human: null, currency: 'USD', gl_code: '6200', status: 'syncing' },
      ],
      error: null,
    });
    const jeChain = createChainMock({ data: { id: 'je-1' }, error: null });
    const insertChain = createChainMock({ data: null, error: null });
    const updateChain = createChainMock({ data: null, error: null });

    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'ledger_connections') return connChain;
      if (table === 'transactions') {
        txCallCount++;
        if (txCallCount === 1) return txListChain;
        if (txCallCount === 2) return claimChain;
        return updateChain;
      }
      if (table === 'journal_entries') return jeChain;
      if (table === 'journal_lines') return insertChain;
      return createChainMock({ data: null, error: null });
    });

    mockBuildJournalEntryFromTransaction.mockReturnValue({
      lines: [
        { glCode: '6200', debit: 99, credit: 0, description: 'Stripe expense' },
        { glCode: '1010', debit: 0, credit: 99, description: 'Cash' },
      ],
    });

    mockSyncJournalEntry.mockResolvedValue({
      success: true,
      journalEntryId: 'xero-je-123',
    });

    const req = createPostRequest({ entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.synced).toBe(1);
    expect(json.failed).toBe(0);
  });

  it('should handle partial failures', async () => {
    const entityChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const connChain = createChainMock({
      data: {
        id: 'conn-1',
        entity_id: VALID_ENTITY_ID,
        access_token: 'enc_access',
        refresh_token: 'enc_refresh',
        tenant_id: 'tenant-123',
        token_expires_at: new Date(Date.now() + 1800000).toISOString(),
        is_active: true,
      },
      error: null,
    });

    const tx1 = { id: 'tx-1', entity_id: VALID_ENTITY_ID, date: '2025-01-15', merchant_name: 'Stripe', amount: 99, category_ai: '6200', category_human: null, currency: 'USD', gl_code: '6200', status: 'approved' };
    const tx2 = { id: 'tx-2', entity_id: VALID_ENTITY_ID, date: '2025-01-16', merchant_name: 'Vercel', amount: 20, category_ai: '6200', category_human: null, currency: 'USD', gl_code: '6200', status: 'approved' };

    const txListChain = createChainMock({ data: [tx1, tx2], error: null });
    const claimChain = createChainMock({
      data: [
        { ...tx1, status: 'syncing' },
        { ...tx2, status: 'syncing' },
      ],
      error: null,
    });
    const updateChain = createChainMock({ data: null, error: null });
    const jeChain = createChainMock({ data: { id: 'je-1' }, error: null });
    const insertChain = createChainMock({ data: null, error: null });
    const stillSyncingChain = createChainMock({ data: [{ id: 'tx-2' }], error: null });

    let txCallCount = 0;
    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'ledger_connections') return connChain;
      if (table === 'transactions') {
        txCallCount++;
        if (txCallCount === 1) return txListChain;
        if (txCallCount === 2) return claimChain;
        if (txCallCount === 4) return stillSyncingChain;
        return updateChain;
      }
      if (table === 'journal_entries') return jeChain;
      if (table === 'journal_lines') return insertChain;
      return createChainMock({ data: null, error: null });
    });

    mockBuildJournalEntryFromTransaction.mockReturnValue({
      lines: [
        { glCode: '6200', debit: 99, credit: 0, description: 'Expense' },
        { glCode: '1010', debit: 0, credit: 99, description: 'Cash' },
      ],
    });

    mockSyncJournalEntry
      .mockResolvedValueOnce({ success: true, journalEntryId: 'xero-je-1' })
      .mockResolvedValueOnce({ success: false, error: 'Xero API rate limited' });

    const req = createPostRequest({ entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.synced).toBe(1);
    expect(json.failed).toBe(1);
    expect(json.errors).toHaveLength(1);
  });

  it('should return 403 when entity belongs to different org', async () => {
    const entityChain = createChainMock({ data: { org_id: 'other-org' }, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createPostRequest({ entityId: VALID_ENTITY_ID });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });
});

describe('GET /api/ledger/xero/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getApiAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthContext);
    mockRefreshXeroToken.mockResolvedValue({
      accessToken: 'new-xero-access',
      refreshToken: 'new-xero-refresh',
      expiresIn: 1800,
    });
  });

  it('should return 400 when entityId is missing', async () => {
    const req = createGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('entityId');
  });

  it('should sync chart of accounts successfully', async () => {
    const entityChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const connChain = createChainMock({
      data: {
        id: 'conn-1',
        entity_id: VALID_ENTITY_ID,
        access_token: 'enc_access',
        refresh_token: 'enc_refresh',
        tenant_id: 'tenant-123',
        token_expires_at: new Date(Date.now() + 1800000).toISOString(),
        is_active: true,
      },
      error: null,
    });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'ledger_connections') return connChain;
      return createChainMock({ data: null, error: null });
    });

    mockSyncChartOfAccounts.mockResolvedValue([
      { code: '200', name: 'Sales' },
      { code: '400', name: 'Advertising' },
      { code: '410', name: 'Bank Fees' },
    ]);
    mockUpsertChartOfAccounts.mockResolvedValue({ upserted: 3, errors: 0 });

    const req = createGetRequest({ entityId: VALID_ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.accounts).toBe(3);
    expect(json.upserted).toBe(3);
  });

  it('should return 404 when no Xero connection exists', async () => {
    const entityChain = createChainMock({ data: { org_id: 'org-1' }, error: null });
    const connChain = createChainMock({ data: null, error: null });

    mockDb.from.mockImplementation((table: string) => {
      if (table === 'entities') return entityChain;
      if (table === 'ledger_connections') return connChain;
      return createChainMock({ data: null, error: null });
    });

    const req = createGetRequest({ entityId: VALID_ENTITY_ID });
    const res = await GET(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('No Xero');
  });
});
